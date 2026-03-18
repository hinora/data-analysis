/**
 * Web Search Tool
 *
 * Perform a web search using the Brave Search API and return the top results.
 * Useful for answering questions that require up-to-date or real-world
 * information not contained in the uploaded datasets.
 */

import { BraveSearch } from "brave-search";
import { type AuthenticatedContext, defineAction } from "core.lib/broker";
import { Errors } from "moleculer";

const MAX_RESULTS = 20;
const DEFAULT_COUNT = 5;

export interface WebSearchParams {
  count?: number;
  country?: string;
  freshness?: string;
  query: string;
  searchLang?: string;
}

export interface WebSearchResultItem {
  description: string;
  pageAge?: string;
  title: string;
  url: string;
}

export interface WebSearchResult {
  count: number;
  query: string;
  results: WebSearchResultItem[];
}

export default defineAction<WebSearchParams, WebSearchResult>({
  authentication: true,
  params: {
    count: {
      default: DEFAULT_COUNT,
      integer: true,
      max: MAX_RESULTS,
      min: 1,
      optional: true,
      type: "number",
    },
    country: { optional: true, type: "string" },
    freshness: {
      enum: ["pd", "pw", "pm", "py"],
      optional: true,
      type: "string",
    },
    query: { min: 1, type: "string" },
    searchLang: { optional: true, type: "string" },
  },

  async handler(ctx: AuthenticatedContext<WebSearchParams>) {
    const {
      count = DEFAULT_COUNT,
      country,
      freshness,
      query,
      searchLang,
    } = ctx.params;

    const apiKey = process.env.BRAVE_API_KEY;
    if (!apiKey) {
      throw new Errors.MoleculerClientError(
        "BRAVE_API_KEY environment variable is not configured",
        500,
        "BRAVE_API_KEY_MISSING",
      );
    }

    const logger = ctx.broker.logger;
    logger.info(`[webSearch] query="${query}", count=${count}`);

    const brave = new BraveSearch(apiKey);

    const response = await brave.webSearch(query, {
      count,
      country,
      freshness: freshness as "pd" | "pw" | "pm" | "py" | undefined,
      search_lang: searchLang,
      text_decorations: false,
    });

    const webResults = response.web?.results ?? [];

    const results: WebSearchResultItem[] = webResults
      .slice(0, count)
      .map((r) => ({
        description: r.description ?? "",
        pageAge: r.page_age,
        title: r.title,
        url: r.url,
      }));

    logger.info(
      `[webSearch] returned ${results.length} results for "${query}"`,
    );

    return {
      count: results.length,
      query,
      results,
    };
  },
});
