/**
 * Tests for tools/webSearch.action.ts
 */

import { createTestContext } from "core.lib/testing";

const mockWebSearch = jest.fn();

jest.mock("brave-search", () => ({
  BraveSearch: jest.fn().mockImplementation(() => ({
    webSearch: mockWebSearch,
  })),
}));

import webSearchAction from "../webSearch.action";

beforeEach(() => {
  jest.clearAllMocks();
});

describe("tools.webSearch action", () => {
  it("should return search results from Brave API", async () => {
    process.env.BRAVE_API_KEY = "test-api-key";

    mockWebSearch.mockResolvedValueOnce({
      web: {
        results: [
          {
            title: "Result 1",
            description: "Description 1",
            url: "https://example.com/1",
            page_age: "2d",
          },
          {
            title: "Result 2",
            description: "Description 2",
            url: "https://example.com/2",
          },
        ],
      },
    });

    const ctx = createTestContext({
      params: { query: "test query", count: 5 },
    });

    const result = await webSearchAction.handler(ctx);

    expect(result.query).toBe("test query");
    expect(result.count).toBe(2);
    expect(result.results).toHaveLength(2);
    expect(result.results[0]).toEqual({
      title: "Result 1",
      description: "Description 1",
      url: "https://example.com/1",
      pageAge: "2d",
    });
    expect(result.results[1].pageAge).toBeUndefined();
  });

  it("should throw error when BRAVE_API_KEY is not set", async () => {
    delete process.env.BRAVE_API_KEY;

    const ctx = createTestContext({
      params: { query: "test query" },
    });

    await expect(webSearchAction.handler(ctx)).rejects.toThrow(
      "BRAVE_API_KEY environment variable is not configured",
    );
  });

  it("should respect count parameter and slice results", async () => {
    process.env.BRAVE_API_KEY = "test-api-key";

    mockWebSearch.mockResolvedValueOnce({
      web: {
        results: [
          { title: "R1", description: "D1", url: "https://example.com/1" },
          { title: "R2", description: "D2", url: "https://example.com/2" },
          { title: "R3", description: "D3", url: "https://example.com/3" },
        ],
      },
    });

    const ctx = createTestContext({
      params: { query: "test", count: 2 },
    });

    const result = await webSearchAction.handler(ctx);
    expect(result.count).toBe(2);
    expect(result.results).toHaveLength(2);
  });

  it("should handle empty results gracefully", async () => {
    process.env.BRAVE_API_KEY = "test-api-key";

    mockWebSearch.mockResolvedValueOnce({ web: { results: [] } });

    const ctx = createTestContext({
      params: { query: "obscure query" },
    });

    const result = await webSearchAction.handler(ctx);
    expect(result.count).toBe(0);
    expect(result.results).toHaveLength(0);
  });
});
