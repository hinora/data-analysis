/**
 * Web Fetch Tool
 *
 * Fetch the content of a web page as plain text using headless Chrome (Puppeteer).
 * Puppeteer executes JavaScript so the tool returns the fully-rendered page
 * content, making it suitable for SPAs and JS-heavy websites.
 */

import type { TypedContext } from "core.lib/__generated__";
import { defineAction } from "core.lib/broker";
import { Errors } from "moleculer";
import puppeteer from "puppeteer";

const DEFAULT_TIMEOUT_MS = 30_000;
const MAX_TIMEOUT_MS = 60_000;
const DEFAULT_MAX_LENGTH = 50_000;
const MAX_CONTENT_LENGTH = 200_000;

export interface WebFetchParams {
  maxLength?: number;
  timeout?: number;
  url: string;
  waitForSelector?: string;
}

export interface WebFetchResult {
  content: string;
  contentLength: number;
  title: string;
  truncated: boolean;
  url: string;
}

export default defineAction<WebFetchParams, WebFetchResult>({
  params: {
    maxLength: {
      default: DEFAULT_MAX_LENGTH,
      integer: true,
      max: MAX_CONTENT_LENGTH,
      min: 100,
      optional: true,
      type: "number",
    },
    timeout: {
      default: DEFAULT_TIMEOUT_MS,
      integer: true,
      max: MAX_TIMEOUT_MS,
      min: 1000,
      optional: true,
      type: "number",
    },
    url: { min: 1, type: "string" },
    waitForSelector: { optional: true, type: "string" },
  },

  async handler(ctx: TypedContext<WebFetchParams>) {
    const {
      maxLength = DEFAULT_MAX_LENGTH,
      timeout = DEFAULT_TIMEOUT_MS,
      url,
      waitForSelector,
    } = ctx.params;

    const logger = ctx.broker.logger;

    // Basic URL validation
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      throw new Errors.MoleculerClientError(
        `Invalid URL: ${url}`,
        400,
        "INVALID_URL",
      );
    }

    // Block non-HTTP(S) schemes
    if (!["http:", "https:"].includes(parsed.protocol)) {
      throw new Errors.MoleculerClientError(
        `Only http and https URLs are supported, got: ${parsed.protocol}`,
        400,
        "UNSUPPORTED_PROTOCOL",
      );
    }

    logger.info(
      `[webFetch] url="${url}", timeout=${timeout}, maxLength=${maxLength}`,
    );

    let browser: Awaited<ReturnType<typeof puppeteer.launch>> | undefined;

    try {
      browser = await puppeteer.launch({
        args: [
          "--disable-dev-shm-usage",
          "--disable-gpu",
          "--no-sandbox",
          "--disable-setuid-sandbox",
        ],
        headless: true,
      });

      const page = await browser.newPage();

      // Block unnecessary resources to speed up page loading
      await page.setRequestInterception(true);
      page.on("request", (req) => {
        const resourceType = req.resourceType();
        if (["font", "image", "media", "stylesheet"].includes(resourceType)) {
          req.abort();
        } else {
          req.continue();
        }
      });

      // Set a reasonable viewport
      await page.setViewport({ height: 1080, width: 1920 });

      // Set a user-agent to avoid bot detection
      await page.setUserAgent(
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      );

      // Navigate to the URL
      await page.goto(url, {
        timeout,
        waitUntil: "networkidle2",
      });

      // Wait for a specific selector if provided
      if (waitForSelector) {
        await page.waitForSelector(waitForSelector, { timeout });
      }

      // Extract page title and text content
      const title = await page.title();
      // The callback passed to page.evaluate() runs inside the Chromium browser
      // context, so `document` is available at runtime despite TypeScript not
      // knowing about DOM types in this Node.js project.
      const extractTextFromPage = new Function(`
        const scripts = document.querySelectorAll("script, style, noscript");
        for (const el of scripts) { el.remove(); }
        return document.body.innerText || "";
      `) as () => string;
      let content: string = await page.evaluate(extractTextFromPage);

      // Clean up whitespace: collapse multiple newlines and trim
      content = content
        .replace(/\n{3,}/g, "\n\n")
        .replace(/[ \t]+/g, " ")
        .trim();

      const contentLength = content.length;
      const truncated = contentLength > maxLength;
      if (truncated) {
        content = content.slice(0, maxLength);
      }

      logger.info(
        `[webFetch] fetched "${title}" — ${contentLength} chars${truncated ? ` (truncated to ${maxLength})` : ""}`,
      );

      return {
        content,
        contentLength,
        title,
        truncated,
        url,
      };
    } catch (error) {
      if (error instanceof Errors.MoleculerClientError) {
        throw error;
      }

      const message =
        error instanceof Error ? error.message : "Unknown error occurred";
      logger.error(`[webFetch] failed for url="${url}": ${message}`);

      throw new Errors.MoleculerClientError(
        `Failed to fetch page: ${message}`,
        500,
        "WEB_FETCH_FAILED",
      );
    } finally {
      if (browser) {
        await browser.close();
      }
    }
  },
});
