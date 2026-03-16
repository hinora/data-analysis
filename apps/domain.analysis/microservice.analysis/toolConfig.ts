/**
 * Tool Configuration Module
 *
 * Centralised registry of all AI tools with their categories, action mappings,
 * and OpenAI-compatible definitions. Provides a configurable enabled/disabled
 * map so both the tool-calling loop (sendMessage) and the system prompt
 * (createConversation) stay in sync.
 */

import type { ToolDefinition } from "core.lib/adapters/ai";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ToolName =
  | "aggregate"
  | "answerFromContext"
  | "correlateFields"
  | "countDistinctValues"
  | "detectOutliers"
  | "filterByCondition"
  | "getChunks"
  | "getDistinctValues"
  | "getPercentile"
  | "joinDatasets"
  | "pivotTable"
  | "sampleData"
  | "semanticSearch"
  | "sortByField"
  | "webFetch"
  | "webSearch";

export type ToolCategory = "structured" | "unstructured" | "web";

export type ToolEnabledConfig = Record<ToolName, boolean>;

interface ToolRegistryEntry {
  action: string;
  category: ToolCategory;
  definition: ToolDefinition;
}

// ---------------------------------------------------------------------------
// Tool Registry — single source of truth
// ---------------------------------------------------------------------------

const TOOL_REGISTRY: Record<ToolName, ToolRegistryEntry> = {
  aggregate: {
    action: "tools.aggregate",
    category: "structured",
    definition: {
      type: "function",
      function: {
        name: "aggregate",
        description:
          "[STRUCTURED DATA ONLY] Multi-field aggregation pipeline for structured-table datasets. Supports sum, avg, min, max, count operations with optional groupBy, ordering, conditions, and filters. Returns at most 200 grouped rows. NULL group-by values are automatically excluded. When grouping by high-cardinality fields, always provide orderBy and a reasonable limit to get the most relevant results. The response includes totalGroups and truncated flag. Use this tool for any aggregation need: totals, averages, counts (with or without groupBy), min/max ranges, etc. Do NOT use on unstructured-text datasets.",
        parameters: {
          type: "object",
          properties: {
            datasetId: { type: "string", description: "Dataset UUID" },
            aggregations: {
              type: "array",
              description:
                "Array of aggregation objects. Each must have field and operation.",
              items: {
                type: "object",
                properties: {
                  field: {
                    type: "string",
                    description: "Column key to aggregate",
                  },
                  operation: {
                    type: "string",
                    enum: ["sum", "avg", "min", "max", "count"],
                    description: "Aggregation operation to apply",
                  },
                },
                required: ["field", "operation"],
              },
            },
            groupBy: {
              type: "array",
              items: { type: "string" },
              description: "Fields to group by",
            },
            conditions: {
              type: "array",
              description:
                "Optional array of filter conditions with operators. Use for filtering records before aggregating.",
              items: {
                type: "object",
                properties: {
                  field: {
                    type: "string",
                    description: "Column key to filter on",
                  },
                  operator: {
                    type: "string",
                    enum: [
                      "eq",
                      "neq",
                      "gt",
                      "gte",
                      "lt",
                      "lte",
                      "contains",
                      "in",
                    ],
                    description:
                      "Comparison operator: eq (equals), neq (not equals), gt/gte/lt/lte (numeric range), contains (case-insensitive substring match), in (value in list)",
                  },
                  value: {
                    type: "string",
                    description:
                      "Value to compare against. For 'in' operator, provide an array of values.",
                  },
                },
                required: ["field", "operator", "value"],
              },
            },
            filters: {
              type: "object",
              description:
                "Optional simple equality filters as key-value pairs (e.g. {country: 'VN'}). For complex filtering use 'conditions' instead.",
            },
            limit: {
              type: "number",
              description:
                "Max number of grouped rows to return (default: 200, max: 200). Use with orderBy to get top/bottom N results.",
            },
            orderBy: {
              type: "object",
              description:
                "Sort grouped results by a field. Use the base column name being aggregated (e.g. 'triGiaUsd' not 'triGiaUsd_sum') or a groupBy field name.",
              properties: {
                field: {
                  type: "string",
                  description:
                    "Base column name to sort by (same name used in aggregations.field or groupBy). Example: if aggregating sum of 'revenue', use 'revenue' here.",
                },
                direction: {
                  type: "string",
                  enum: ["asc", "desc"],
                  description: "Sort direction",
                },
              },
              required: ["field", "direction"],
            },
          },
          required: ["datasetId", "aggregations"],
        },
      },
    },
  },

  answerFromContext: {
    action: "tools.answerFromContext",
    category: "unstructured",
    definition: {
      type: "function",
      function: {
        name: "answerFromContext",
        description:
          "[UNSTRUCTURED TEXT ONLY] Answer a question using retrieved text context via vector search on unstructured-text datasets. Do NOT use on structured-table datasets.",
        parameters: {
          type: "object",
          properties: {
            sessionId: { type: "string", description: "Session UUID" },
            question: { type: "string", description: "The question to answer" },
            topK: {
              type: "number",
              description: "Context chunks to retrieve (default: 5)",
            },
            datasetId: {
              type: "string",
              description: "Optional dataset UUID to scope the search",
            },
          },
          required: ["sessionId", "question"],
        },
      },
    },
  },

  correlateFields: {
    action: "tools.correlateFields",
    category: "structured",
    definition: {
      type: "function",
      function: {
        name: "correlateFields",
        description:
          "[STRUCTURED DATA ONLY] Calculate Pearson correlation between two numeric fields in a structured-table dataset. Do NOT use on unstructured-text datasets.",
        parameters: {
          type: "object",
          properties: {
            datasetId: { type: "string", description: "Dataset UUID" },
            field1: { type: "string", description: "First numeric column" },
            field2: { type: "string", description: "Second numeric column" },
          },
          required: ["datasetId", "field1", "field2"],
        },
      },
    },
  },

  countDistinctValues: {
    action: "tools.countDistinctValues",
    category: "structured",
    definition: {
      type: "function",
      function: {
        name: "countDistinctValues",
        description:
          "[STRUCTURED DATA ONLY] Count how many distinct values exist for a field without returning the values themselves. Works on ANY field type (numeric or categorical). Use this to check cardinality before deciding whether to call getDistinctValues. Do NOT use on unstructured-text datasets.",
        parameters: {
          type: "object",
          properties: {
            datasetId: { type: "string", description: "Dataset UUID" },
            field: {
              type: "string",
              description: "Column key (any type)",
            },
          },
          required: ["datasetId", "field"],
        },
      },
    },
  },

  detectOutliers: {
    action: "tools.detectOutliers",
    category: "structured",
    definition: {
      type: "function",
      function: {
        name: "detectOutliers",
        description:
          "[STRUCTURED DATA ONLY] Detect outliers in a numeric field of a structured-table dataset using IQR or z-score method. Do NOT use on unstructured-text datasets.",
        parameters: {
          type: "object",
          properties: {
            datasetId: { type: "string", description: "Dataset UUID" },
            field: {
              type: "string",
              description: "Numeric column key",
            },
            method: {
              type: "string",
              enum: ["iqr", "zscore"],
              description: "Detection method (default: iqr)",
            },
            threshold: {
              type: "number",
              description:
                "Sensitivity threshold (default: 1.5 for IQR, 3 for z-score)",
            },
          },
          required: ["datasetId", "field"],
        },
      },
    },
  },

  filterByCondition: {
    action: "tools.filterByCondition",
    category: "structured",
    definition: {
      type: "function",
      function: {
        name: "filterByCondition",
        description:
          "[STRUCTURED DATA ONLY] Filter records in a structured-table dataset by conditions (equals, range, contains, in). Do NOT use on unstructured-text datasets.",
        parameters: {
          type: "object",
          properties: {
            datasetId: { type: "string", description: "Dataset UUID" },
            conditions: {
              type: "array",
              description:
                "Array of condition objects. Each object must have field, operator, and value.",
              items: {
                type: "object",
                properties: {
                  field: {
                    type: "string",
                    description: "Column key to filter on",
                  },
                  operator: {
                    type: "string",
                    enum: [
                      "eq",
                      "neq",
                      "gt",
                      "gte",
                      "lt",
                      "lte",
                      "contains",
                      "in",
                    ],
                    description:
                      "Comparison operator: eq (equals), neq (not equals), gt, gte, lt, lte, contains (substring match), in (value in list)",
                  },
                  value: {
                    type: "string",
                    description:
                      "Value to compare against. Use string for eq/neq/contains, number string for gt/gte/lt/lte, or JSON array string for in.",
                  },
                },
                required: ["field", "operator", "value"],
              },
            },
            limit: {
              type: "number",
              description: "Max results (default: 100)",
            },
          },
          required: ["datasetId", "conditions"],
        },
      },
    },
  },

  getChunks: {
    action: "tools.getChunks",
    category: "unstructured",
    definition: {
      type: "function",
      function: {
        name: "getChunks",
        description:
          "[UNSTRUCTURED TEXT ONLY] Retrieve text chunks from an unstructured-text dataset by order index range. Use the document index from dataset metadata to find the relevant section, then call this tool with the section's chunk range to read the actual content. Do NOT use on structured-table datasets.",
        parameters: {
          type: "object",
          properties: {
            datasetId: { type: "string", description: "Dataset UUID" },
            startIndex: {
              type: "number",
              description:
                "Starting chunk order index (default: 0). Use chunkStart from the document index.",
            },
            endIndex: {
              type: "number",
              description:
                "Ending chunk order index (inclusive). Use chunkEnd from the document index.",
            },
            limit: {
              type: "number",
              description:
                "Max chunks to return when endIndex is not specified (default: 20, max: 50)",
            },
          },
          required: ["datasetId"],
        },
      },
    },
  },

  getDistinctValues: {
    action: "tools.getDistinctValues",
    category: "structured",
    definition: {
      type: "function",
      function: {
        name: "getDistinctValues",
        description:
          "[STRUCTURED DATA ONLY] Get distinct values with counts for a CATEGORICAL field in a structured-table dataset. Do NOT use on numeric/number fields (use countDistinctValues or aggregate with min/max instead). Do NOT use on unstructured-text datasets.",
        parameters: {
          type: "object",
          properties: {
            datasetId: { type: "string", description: "Dataset UUID" },
            field: {
              type: "string",
              description: "Column key (categorical/text only, NOT numeric)",
            },
            limit: {
              type: "number",
              description:
                "Maximum number of distinct values to return (default: 50)",
            },
          },
          required: ["datasetId", "field"],
        },
      },
    },
  },

  getPercentile: {
    action: "tools.getPercentile",
    category: "structured",
    definition: {
      type: "function",
      function: {
        name: "getPercentile",
        description:
          "[STRUCTURED DATA ONLY] Calculate percentile values for a numeric field in a structured-table dataset. Do NOT use on unstructured-text datasets.",
        parameters: {
          type: "object",
          properties: {
            datasetId: { type: "string", description: "Dataset UUID" },
            field: {
              type: "string",
              description: "Numeric column key",
            },
            percentiles: {
              type: "array",
              items: { type: "number" },
              description:
                "Percentile values 0-100 to compute (default: [25,50,75,90,95,99])",
            },
          },
          required: ["datasetId", "field"],
        },
      },
    },
  },

  joinDatasets: {
    action: "tools.joinDatasets",
    category: "structured",
    definition: {
      type: "function",
      function: {
        name: "joinDatasets",
        description:
          "[STRUCTURED DATA ONLY] Join two structured-table datasets on matching fields. Do NOT use on unstructured-text datasets.",
        parameters: {
          type: "object",
          properties: {
            leftDatasetId: {
              type: "string",
              description: "Left dataset UUID",
            },
            rightDatasetId: {
              type: "string",
              description: "Right dataset UUID",
            },
            leftField: {
              type: "string",
              description: "Join key in left dataset",
            },
            rightField: {
              type: "string",
              description: "Join key in right dataset",
            },
            joinType: {
              type: "string",
              enum: ["inner", "left", "right"],
              description: "Type of join (default: inner)",
            },
            limit: {
              type: "number",
              description: "Max results (default: 100, max: 500)",
            },
          },
          required: [
            "leftDatasetId",
            "rightDatasetId",
            "leftField",
            "rightField",
          ],
        },
      },
    },
  },

  pivotTable: {
    action: "tools.pivotTable",
    category: "structured",
    definition: {
      type: "function",
      function: {
        name: "pivotTable",
        description:
          "[STRUCTURED DATA ONLY] Create a pivot table (cross-tabulation) from a structured-table dataset. Do NOT use on unstructured-text datasets.",
        parameters: {
          type: "object",
          properties: {
            datasetId: { type: "string", description: "Dataset UUID" },
            rowField: {
              type: "string",
              description: "Column key for pivot rows",
            },
            columnField: {
              type: "string",
              description: "Column key for pivot columns",
            },
            valueField: {
              type: "string",
              description: "Column key for values to aggregate",
            },
            aggregation: {
              type: "string",
              enum: ["sum", "avg", "count", "min", "max"],
              description: "Aggregation function (default: sum)",
            },
          },
          required: ["datasetId", "rowField", "columnField", "valueField"],
        },
      },
    },
  },

  sampleData: {
    action: "tools.sampleData",
    category: "structured",
    definition: {
      type: "function",
      function: {
        name: "sampleData",
        description:
          "[STRUCTURED DATA ONLY] Preview rows from a structured-table dataset. Returns the first N rows so you can understand column formats, data types, and representative values before performing analysis. Use this as a first step to explore unfamiliar data. Do NOT use on unstructured-text datasets.",
        parameters: {
          type: "object",
          properties: {
            datasetId: { type: "string", description: "Dataset UUID" },
            limit: {
              type: "number",
              description: "Number of rows to return (default: 10, max: 100)",
            },
          },
          required: ["datasetId"],
        },
      },
    },
  },

  semanticSearch: {
    action: "tools.semanticSearch",
    category: "unstructured",
    definition: {
      type: "function",
      function: {
        name: "semanticSearch",
        description:
          "[UNSTRUCTURED TEXT ONLY] Search text chunks by semantic similarity using vector embeddings. Only works on unstructured-text datasets. Do NOT use on structured-table datasets. Requires at least one of sessionId or datasetId (or both).",
        parameters: {
          type: "object",
          properties: {
            sessionId: {
              type: "string",
              description:
                "Session UUID for scope (optional if datasetId provided)",
            },
            query: { type: "string", description: "Search query text" },
            topK: {
              type: "number",
              description: "Number of results (default: 5)",
            },
            datasetId: {
              type: "string",
              description:
                "Dataset UUID to scope search (optional if sessionId provided)",
            },
          },
          required: ["query"],
        },
      },
    },
  },

  sortByField: {
    action: "tools.sortByField",
    category: "structured",
    definition: {
      type: "function",
      function: {
        name: "sortByField",
        description:
          "[STRUCTURED DATA ONLY] Sort and return records from a structured-table dataset by a specified field. Do NOT use on unstructured-text datasets.",
        parameters: {
          type: "object",
          properties: {
            datasetId: { type: "string", description: "Dataset UUID" },
            field: {
              type: "string",
              description: "Column key to sort by",
            },
            order: {
              type: "string",
              enum: ["ASC", "DESC"],
              description: "Sort direction (default: ASC)",
            },
            limit: {
              type: "number",
              description: "Max results (default: 100, max: 500)",
            },
            numeric: {
              type: "boolean",
              description:
                "Treat field as numeric for sorting (auto-detected if omitted)",
            },
          },
          required: ["datasetId", "field"],
        },
      },
    },
  },

  webSearch: {
    action: "tools.webSearch",
    category: "web",
    definition: {
      type: "function",
      function: {
        name: "webSearch",
        description:
          "[WEB SEARCH] Search the internet using Brave Search API to find up-to-date information, news, or facts not available in the uploaded datasets. Use when the user asks questions that require real-time or external knowledge.",
        parameters: {
          type: "object",
          properties: {
            query: {
              type: "string",
              description: "The search query string",
            },
            count: {
              type: "number",
              description: "Number of results to return (default: 5, max: 20)",
            },
            country: {
              type: "string",
              description:
                "Country code for search results (e.g. 'us', 'vn', 'gb')",
            },
            freshness: {
              type: "string",
              enum: ["pd", "pw", "pm", "py"],
              description:
                "Filter results by age: pd (past day), pw (past week), pm (past month), py (past year)",
            },
            searchLang: {
              type: "string",
              description: "Search language preference (e.g. 'en', 'vi', 'ja')",
            },
          },
          required: ["query"],
        },
      },
    },
  },

  webFetch: {
    action: "tools.webFetch",
    category: "web",
    definition: {
      type: "function",
      function: {
        name: "webFetch",
        description:
          "[WEB FETCH] Fetch the content of a web page as plain text. Uses headless Chrome to execute JavaScript and render the page, so it works with SPAs and JS-heavy sites. Use when the user provides a URL and wants to read its content, or after webSearch to get full page content from a result.",
        parameters: {
          type: "object",
          properties: {
            url: {
              type: "string",
              description: "The URL of the web page to fetch",
            },
            waitForSelector: {
              type: "string",
              description:
                "Optional CSS selector to wait for before extracting content (e.g. '#main-content', '.article-body'). Useful for pages that load content dynamically.",
            },
            maxLength: {
              type: "number",
              description:
                "Maximum number of characters to return (default: 50000, max: 200000). Content is truncated if longer.",
            },
            timeout: {
              type: "number",
              description:
                "Maximum time in milliseconds to wait for the page to load (default: 30000, max: 60000)",
            },
          },
          required: ["url"],
        },
      },
    },
  },
};

// ---------------------------------------------------------------------------
// Public helpers
// ---------------------------------------------------------------------------

/** All tool names in the registry (alphabetical). */
export const ALL_TOOL_NAMES: ToolName[] = Object.keys(
  TOOL_REGISTRY,
).sort() as ToolName[];

/**
 * Returns the default enabled/disabled map — every tool enabled.
 * Override individual entries to disable specific tools.
 *
 * @example
 * const config = getDefaultToolEnabledConfig();
 * config.countAndGroup = false;
 * config.pivotTable = false;
 * const tools = getEnabledToolDefinitions(config);
 */
export function getDefaultToolEnabledConfig(): ToolEnabledConfig {
  const config = {} as ToolEnabledConfig;
  for (const name of ALL_TOOL_NAMES) {
    config[name] = true;
  }
  return config;
}

/** Returns the TOOL_TO_ACTION map filtered to enabled tools only. */
export function getEnabledToolActions(
  config: ToolEnabledConfig,
): Record<string, string> {
  const result: Record<string, string> = {};
  for (const name of ALL_TOOL_NAMES) {
    if (config[name]) {
      result[name] = TOOL_REGISTRY[name].action;
    }
  }
  return result;
}

/** Returns ToolDefinition[] for enabled tools only. */
export function getEnabledToolDefinitions(
  config: ToolEnabledConfig,
): ToolDefinition[] {
  return ALL_TOOL_NAMES.filter((name) => config[name]).map(
    (name) => TOOL_REGISTRY[name].definition,
  );
}

/** Returns enabled tool names grouped by category. */
export function getEnabledToolNamesByCategory(config: ToolEnabledConfig): {
  structured: ToolName[];
  unstructured: ToolName[];
  web: ToolName[];
} {
  const structured: ToolName[] = [];
  const unstructured: ToolName[] = [];
  const web: ToolName[] = [];

  for (const name of ALL_TOOL_NAMES) {
    if (!config[name]) continue;
    const category = TOOL_REGISTRY[name].category;
    if (category === "structured") {
      structured.push(name);
    } else if (category === "web") {
      web.push(name);
    } else {
      unstructured.push(name);
    }
  }

  return { structured, unstructured, web };
}

/** Looks up the category for a tool name. */
export function getToolCategory(name: ToolName): ToolCategory {
  return TOOL_REGISTRY[name].category;
}
