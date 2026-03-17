/**
 * Tests for tools/webFetch.action.ts
 */

import { createTestContext } from "core.lib/testing";

const mockPage = {
  setRequestInterception: jest.fn(),
  on: jest.fn(),
  setViewport: jest.fn(),
  setUserAgent: jest.fn(),
  goto: jest.fn(),
  waitForSelector: jest.fn(),
  title: jest.fn(),
  evaluate: jest.fn(),
  close: jest.fn(),
};

const mockBrowser = {
  newPage: jest.fn().mockResolvedValue(mockPage),
  close: jest.fn(),
};

jest.mock("puppeteer", () => ({
  __esModule: true,
  default: {
    launch: jest.fn().mockResolvedValue(mockBrowser),
  },
}));

import webFetchAction from "../webFetch.action";

beforeEach(() => {
  jest.clearAllMocks();
  mockPage.title.mockResolvedValue("Test Page");
  mockPage.evaluate.mockResolvedValue("Hello World content from the page.");
  mockBrowser.newPage.mockResolvedValue(mockPage);
});

describe("tools.webFetch action", () => {
  it("should fetch a web page and return content", async () => {
    const ctx = createTestContext({
      params: { url: "https://example.com" },
    });

    const result = await webFetchAction.handler(ctx);

    expect(result.url).toBe("https://example.com");
    expect(result.title).toBe("Test Page");
    expect(result.content).toBe("Hello World content from the page.");
    expect(result.truncated).toBe(false);
    expect(mockBrowser.close).toHaveBeenCalled();
  });

  it("should throw error for invalid URL", async () => {
    const ctx = createTestContext({
      params: { url: "not-a-url" },
    });

    await expect(webFetchAction.handler(ctx)).rejects.toThrow("Invalid URL");
  });

  it("should throw error for non-HTTP protocols", async () => {
    const ctx = createTestContext({
      params: { url: "ftp://example.com/file" },
    });

    await expect(webFetchAction.handler(ctx)).rejects.toThrow(
      "Only http and https URLs are supported",
    );
  });

  it("should truncate content when it exceeds maxLength", async () => {
    const longContent = "A".repeat(1000);
    mockPage.evaluate.mockResolvedValue(longContent);

    const ctx = createTestContext({
      params: { url: "https://example.com", maxLength: 100 },
    });

    const result = await webFetchAction.handler(ctx);

    expect(result.truncated).toBe(true);
    expect(result.content.length).toBe(100);
    expect(result.contentLength).toBe(1000);
  });

  it("should wait for selector when specified", async () => {
    const ctx = createTestContext({
      params: { url: "https://example.com", waitForSelector: "#content" },
    });

    await webFetchAction.handler(ctx);

    expect(mockPage.waitForSelector).toHaveBeenCalledWith(
      "#content",
      expect.objectContaining({ timeout: expect.any(Number) }),
    );
  });

  it("should close browser even on error", async () => {
    mockPage.goto.mockRejectedValue(new Error("Navigation failed"));

    const ctx = createTestContext({
      params: { url: "https://example.com" },
    });

    await expect(webFetchAction.handler(ctx)).rejects.toThrow(
      "Failed to fetch page",
    );
    expect(mockBrowser.close).toHaveBeenCalled();
  });
});
