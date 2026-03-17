/**
 * Tests for upload/searchWebsites.action.ts
 */

import { defineTest } from "core.lib/testing";
import searchWebsitesAction from "../searchWebsites.action";

const SESSION_ID = "11111111-1111-4111-8111-111111111111";

const SEARCH_RESULTS_A = {
  count: 2,
  query: "keyword1",
  results: [
    {
      title: "Result A1",
      url: "https://example.com/a1",
      description: "Description A1",
    },
    {
      title: "Result A2",
      url: "https://example.com/a2",
      description: "Description A2",
    },
  ],
};

const SEARCH_RESULTS_B = {
  count: 2,
  query: "keyword2",
  results: [
    {
      title: "Result B1",
      url: "https://example.com/b1",
      description: "Description B1",
    },
    {
      title: "Result A1 Duplicate",
      url: "https://example.com/a1",
      description: "Description A1 dup",
    },
  ],
};

describe("upload.searchWebsites action", () => {
  defineTest({
    name: "should return search results for a single keyword",
    action: searchWebsitesAction,
    params: {
      sessionId: SESSION_ID,
      keywords: ["keyword1"],
    },
    callStubs: {
      "tools.webSearch": SEARCH_RESULTS_A,
    },
    assertResult: (result) => {
      expect(result.keywords).toEqual(["keyword1"]);
      expect(result.results).toHaveLength(2);
      expect(result.totalCount).toBe(2);
      expect(result.results[0].title).toBe("Result A1");
      expect(result.results[0].keyword).toBe("keyword1");
      expect(result.results[1].title).toBe("Result A2");
    },
  });

  defineTest({
    name: "should deduplicate results across multiple keywords",
    action: searchWebsitesAction,
    params: {
      sessionId: SESSION_ID,
      keywords: ["keyword1", "keyword2"],
    },
    callStubs: {
      "tools.webSearch": (params: { query: string }) => {
        if (params.query === "keyword1") return SEARCH_RESULTS_A;
        if (params.query === "keyword2") return SEARCH_RESULTS_B;
        return { count: 0, query: params.query, results: [] };
      },
    },
    assertResult: (result) => {
      expect(result.keywords).toEqual(["keyword1", "keyword2"]);
      // A1, A2 from keyword1 + B1 from keyword2 (A1 is duplicate, so skipped)
      expect(result.results).toHaveLength(3);
      expect(result.totalCount).toBe(3);

      const urls = result.results.map((r) => r.url);
      expect(urls).toContain("https://example.com/a1");
      expect(urls).toContain("https://example.com/a2");
      expect(urls).toContain("https://example.com/b1");

      // The first A1 result should be from keyword1
      const a1 = result.results.find((r) => r.url === "https://example.com/a1");
      expect(a1?.keyword).toBe("keyword1");
    },
  });

  defineTest({
    name: "should reject invalid sessionId",
    action: searchWebsitesAction,
    params: {
      sessionId: "invalid",
      keywords: ["test"],
    },
    expectError: "Invalid or missing sessionId",
  });

  defineTest({
    name: "should handle search failure for one keyword gracefully",
    action: searchWebsitesAction,
    params: {
      sessionId: SESSION_ID,
      keywords: ["failing-keyword", "keyword1"],
    },
    callStubs: {
      "tools.webSearch": (params: { query: string }) => {
        if (params.query === "failing-keyword") {
          throw new Error("API key invalid");
        }
        return SEARCH_RESULTS_A;
      },
    },
    assertResult: (result) => {
      // Should still return results from the successful keyword
      expect(result.results).toHaveLength(2);
      expect(result.results[0].keyword).toBe("keyword1");
    },
  });

  defineTest({
    name: "should return empty results when all searches fail",
    action: searchWebsitesAction,
    params: {
      sessionId: SESSION_ID,
      keywords: ["bad-keyword"],
    },
    callStubs: {
      "tools.webSearch": () => {
        throw new Error("API unavailable");
      },
    },
    assertResult: (result) => {
      expect(result.results).toHaveLength(0);
      expect(result.totalCount).toBe(0);
    },
  });

  defineTest({
    name: "should pass count parameter to webSearch",
    action: searchWebsitesAction,
    params: {
      sessionId: SESSION_ID,
      keywords: ["test"],
      count: 10,
    },
    callStubs: {
      "tools.webSearch": (params: { query: string; count: number }) => {
        expect(params.count).toBe(10);
        return { count: 0, query: params.query, results: [] };
      },
    },
    assertResult: (result) => {
      expect(result.results).toHaveLength(0);
    },
  });
});
