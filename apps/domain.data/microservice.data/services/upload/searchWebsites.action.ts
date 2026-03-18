/**
 * Search Websites Action
 *
 * Accepts one or more search keywords, queries the Brave Search API for each,
 * and returns a deduplicated list of website results. The user can then
 * select which websites to import via the importFromUrl action.
 */

import { type AuthenticatedContext, defineAction } from "core.lib/broker";
import { Errors } from "moleculer";

export interface SearchWebsitesParams {
  count?: number;
  keywords: string[];
  sessionId: string;
}

export interface SearchWebsiteItem {
  description: string;
  keyword: string;
  title: string;
  url: string;
}

export interface SearchWebsitesResult {
  keywords: string[];
  results: SearchWebsiteItem[];
  totalCount: number;
}

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DEFAULT_COUNT = 5;
const MAX_COUNT = 20;
const MAX_KEYWORDS = 10;

export default defineAction<SearchWebsitesParams, SearchWebsitesResult>({
  authentication: true,
  rest: "POST /:sessionId/search-websites",

  params: {
    count: {
      default: DEFAULT_COUNT,
      integer: true,
      max: MAX_COUNT,
      min: 1,
      optional: true,
      type: "number",
    },
    keywords: {
      items: { min: 1, type: "string" },
      max: MAX_KEYWORDS,
      min: 1,
      type: "array",
    },
    sessionId: { type: "string", min: 1 },
  },

  async handler(ctx: AuthenticatedContext<SearchWebsitesParams>) {
    const { keywords, sessionId, count = DEFAULT_COUNT } = ctx.params;
    const logger = ctx.broker.logger;

    if (!sessionId || !UUID_REGEX.test(sessionId)) {
      throw new Errors.MoleculerClientError(
        "Invalid or missing sessionId",
        400,
        "INVALID_SESSION_ID",
        { sessionId },
      );
    }

    logger.info(
      `[searchWebsites] keywords=${JSON.stringify(keywords)}, count=${count} for session ${sessionId}`,
    );

    // Search for each keyword using the existing webSearch tool
    const allResults: SearchWebsiteItem[] = [];
    const seenUrls = new Set<string>();

    for (const keyword of keywords) {
      try {
        const searchResult: {
          results: Array<{
            title: string;
            url: string;
            description: string;
          }>;
        } = await ctx.call("tools.webSearch", {
          query: keyword,
          count,
        });

        for (const result of searchResult.results) {
          if (!seenUrls.has(result.url)) {
            seenUrls.add(result.url);
            allResults.push({
              description: result.description,
              keyword,
              title: result.title,
              url: result.url,
            });
          }
        }
      } catch (err) {
        logger.warn(
          `[searchWebsites] search failed for keyword "${keyword}":`,
          err,
        );
        // Continue with other keywords if one fails
      }
    }

    logger.info(
      `[searchWebsites] found ${allResults.length} unique results for ${keywords.length} keywords`,
    );

    return {
      keywords,
      results: allResults,
      totalCount: allResults.length,
    };
  },
});
