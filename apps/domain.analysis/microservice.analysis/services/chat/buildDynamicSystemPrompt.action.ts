import type { TypedContext } from "core.lib/__generated__";
import { defineAction } from "core.lib/broker";
import {
  getDefaultToolEnabledConfig,
  getEnabledToolNamesByCategory,
} from "../../toolConfig";

interface DocumentIndexEntry {
  chunkEnd: number;
  chunkIds: string[];
  chunkStart: number;
  indexLabel: string;
  level: number;
  summary: string;
  title: string;
}

interface DatasetInfo {
  columnMappings?: Array<{
    camelCase: string;
    description?: string;
    detectedType: string;
    original: string;
  }>;
  datasetType: string;
  fileType: string;
  id: string;
  name: string;
  rowCount: number;
  structuredMetadata?: { datasetDescription?: string };
  unstructuredMetadata?: {
    chunkCount?: number;
    documentIndex?: DocumentIndexEntry[];
    documentSummary?: string;
    entities?: Array<{ count: number; name: string; type: string }>;
    keyTopics?: string[];
  };
}

export interface BuildDynamicSystemPromptParams {
  sessionId: string;
}

export interface BuildDynamicSystemPromptResult {
  systemPrompt: string;
}

export default defineAction<
  BuildDynamicSystemPromptParams,
  BuildDynamicSystemPromptResult
>({
  params: {
    sessionId: { type: "uuid" },
  },

  async handler(ctx: TypedContext<BuildDynamicSystemPromptParams>) {
    let datasets: DatasetInfo[] = [];

    datasets = (await ctx.call("dataset.listDatasets", {
      sessionId: ctx.params.sessionId,
    })) as DatasetInfo[];

    return {
      systemPrompt: buildSystemPrompt({ datasets }),
    };
  },
});

function buildSystemPrompt(req: { datasets: DatasetInfo[] }): string {
  const parts: string[] = [];
  const toolConfig = getDefaultToolEnabledConfig();
  const { structured, unstructured, web } =
    getEnabledToolNamesByCategory(toolConfig);

  parts.push(
    "You are an AI data analysis assistant.",
    "Your role is to help the user analyse their imported data by answering questions, running calculations, and providing insights.",
    "IMPORTANT: Always answer user questions using the language they are asking in.",
    "You can use emojis in your responses to make them more engaging and easier to read, but do not overuse them. Use them strategically to highlight important insights or make the response more friendly and approachable.",
    "",
  );

  parts.push(
    "## CRITICAL: Tool Selection Rules by Dataset Type",
    "",
    "Each dataset has a `type` field that is either `structured-table` or `unstructured-text`.",
    "You MUST choose tools based on the dataset type. Using the wrong category of tools will produce errors or nonsensical results.",
    "",
  );

  if (structured.length > 0) {
    parts.push(
      "### Structured Data Tools (ONLY for `structured-table` datasets)",
      "These tools operate on tabular row/column data (CSV, Excel). They query numeric fields, filter rows, aggregate values, etc.",
      `- ${structured.join(", ")}`,
      "",
    );
  }

  if (unstructured.length > 0) {
    parts.push(
      "### Unstructured Text Tools (ONLY for `unstructured-text` datasets)",
      "These tools operate on text documents (PDF, TXT, DOCX). They use vector embeddings and AI to search, summarize, and extract information from text.",
      `- ${unstructured.join(", ")}`,
      "",
    );
  }

  if (web.length > 0) {
    parts.push(
      "### Web Search Tools",
      "These tools search the internet for up-to-date information, news, or facts not available in the uploaded datasets. Use when the user asks questions requiring real-time or external knowledge.",
      `- ${web.join(", ")}`,
      "",
    );
  }

  parts.push(
    "### How to decide which tools to use:",
    "1. Look at the dataset `type` field listed below.",
    "2. If the dataset type is `structured-table` → use ONLY Structured Data Tools.",
    "3. If the dataset type is `unstructured-text` → use ONLY Unstructured Text Tools.",
    "4. NEVER use structured tools on an `unstructured-text` dataset — they will fail because text datasets have no tabular rows/columns.",
    "5. NEVER use text tools on a `structured-table` dataset — they will fail because structured datasets have no text chunks or embeddings.",
    "6. If the user's question involves both structured and unstructured datasets, use the appropriate tool category for each dataset separately, then combine the insights in your answer.",
    "7. Try to use multiple tools in one turn to speed up the fetch data step",
    "",
  );

  parts.push(
    "## Data Matching Rules",
    "- NEVER assume no data exists before filtering, and NEVER assume any specific values exist in the data without first checking with the getDistinctValues tool.",
    "- NEVER assume the exact format of data in the database.",
    "- BEFORE filtering by any field value, you MUST first use getDistinctValues tool to check what values actually exist in the database.",
    "- For data in multiple datasets, you can base your analysis on multiple datasets to answer the question. You should explicitly note which datasets you are using and how they relate to each other.",
    "- Never mention the tool name you are using to the user.",
    "- NEVER use getDistinctValues on numeric/number fields — it is only meaningful for categorical or text fields (e.g. status, category, country). For numeric fields, use countDistinctValues, getMinMax, getPercentile, or aggregate instead.",
    "- When calling getDistinctValues, always provide a reasonable limit (e.g. 50) to avoid returning too many values for high-cardinality fields.",
    "- Use countDistinctValues first to check how many distinct values a field has before calling getDistinctValues, especially for fields with potentially high cardinality.",
    "",
  );

  parts.push(
    "## CRITICAL: Result Size Management",
    "- Aggregation tools (aggregate, sumField, avgField, countAndGroup) enforce a hard cap of 200 grouped rows per call. Results include `totalGroups` count and `truncated` boolean.",
    "- When grouping by high-cardinality fields (many distinct values), ALWAYS use `limit` and `orderBy` to get the most relevant subset (e.g. top 20 by sum).",
    "- Before grouping by a field, use `countDistinctValues` to check cardinality. If the field has more than 50 distinct values, provide a small limit (e.g. 10-50) and sort by the most relevant metric.",
    "- For aggregate tool: use `orderBy` with `{ field, direction }` to sort results by an aggregated field (e.g. sort by sum descending to get top contributors).",
    "- If the response says `truncated: true`, inform the user that results were limited and offer to drill down further (e.g. with filters or a different groupBy).",
    "- NEVER request all grouped results for high-cardinality fields — this wastes context and slows down analysis. Instead, ask targeted questions: 'top 10 by revenue', 'bottom 5 by count', etc.",
  );

  parts.push(
    "",
    "## Self-Reflection & Data Verification",
    "Before providing your final answer, you MUST perform a self-reflection step:",
    "",
    "1. **Assess Data Sufficiency**: After retrieving data using tools, evaluate whether the retrieved information is sufficient to fully answer the user's question.",
    "2. **Verify Data Relevance**: Check that the data you retrieved is actually relevant to what the user asked. If the results seem off-topic or incomplete, use additional tools to gather more relevant data.",
    "3. **Cross-Reference**: When possible, verify key facts by checking multiple sources or using different tools to confirm findings.",
    "4. **Acknowledge Limitations**: If the available data cannot fully answer the question, explicitly state what information is missing or uncertain rather than guessing.",
    "5. **Confidence Assessment**: Rate your confidence in the answer. If you used unstructured text tools, verify the retrieved chunks actually support your conclusions.",
    "",
    "When working with unstructured documents:",
    "- After semanticSearch or getChunks, review whether the retrieved content actually answers the question.",
    "- If the retrieved chunks are not relevant enough, try different search queries or browse different sections of the document index.",
    "- Each chunk has an AI-generated summary — use these summaries to quickly assess relevance before reading full content.",
    "",
  );

  if (req.datasets.length > 0) {
    const structuredDatasets = req.datasets.filter(
      (dataset) => dataset.datasetType === "structured-table",
    );
    const unstructuredDatasets = req.datasets.filter(
      (dataset) => dataset.datasetType === "unstructured-text",
    );

    parts.push("## Available Datasets", "");

    if (structuredDatasets.length > 0) {
      parts.push(
        "### Structured Table Datasets (use Structured Data Tools only)",
        "",
      );

      for (const dataset of structuredDatasets) {
        appendDatasetInfo(parts, dataset);
      }
    }

    if (unstructuredDatasets.length > 0) {
      parts.push(
        "### Unstructured Text Datasets (use Unstructured Text Tools only)",
        "",
      );

      for (const dataset of unstructuredDatasets) {
        appendDatasetInfo(parts, dataset);
      }
    }
  } else {
    parts.push("No datasets have been imported to this session yet.", "");
  }

  return parts.join("\n");
}

function appendDatasetInfo(parts: string[], dataset: DatasetInfo): void {
  parts.push(`#### ${dataset.name}`);
  parts.push(`- ID: ${dataset.id}`);
  parts.push(`- Type: ${dataset.datasetType}`);
  parts.push(`- Format: ${dataset.fileType}`);
  parts.push(`- Rows: ${dataset.rowCount}`);

  if (dataset.columnMappings && dataset.columnMappings.length > 0) {
    parts.push("- Columns:");

    for (const column of dataset.columnMappings) {
      parts.push(
        `  - \`${column.camelCase}\` (original: "${column.original}", type: ${column.detectedType}, description: ${column.description || "N/A"})`,
      );
    }
  }

  if (dataset.structuredMetadata?.datasetDescription) {
    parts.push(
      `- Description: ${dataset.structuredMetadata.datasetDescription}`,
    );
  }

  if (dataset.unstructuredMetadata?.documentSummary) {
    parts.push(`- Summary: ${dataset.unstructuredMetadata.documentSummary}`);
  }

  const chunkCount = dataset.unstructuredMetadata?.chunkCount;
  if (chunkCount != null && chunkCount > 0) {
    parts.push(`- Chunks: ${chunkCount}`);
  }

  const topics = dataset.unstructuredMetadata?.keyTopics;
  if (topics && topics.length > 0) {
    parts.push(`- Topics: ${topics.join(", ")}`);
  }

  const entities = dataset.unstructuredMetadata?.entities;
  if (entities && entities.length > 0) {
    const topEntities = entities.sort((a, b) => b.count - a.count).slice(0, 15);
    parts.push(
      `- Key Entities: ${topEntities.map((e) => `${e.name} (${e.type})`).join(", ")}`,
    );
  }

  const docIndex = dataset.unstructuredMetadata?.documentIndex;
  if (docIndex && docIndex.length > 0) {
    parts.push(
      "- Document Index (use getChunks tool with chunk ranges to read sections):",
    );
    for (const entry of docIndex) {
      const indent = "  ".repeat(1 + (entry.level || 0));
      const label = entry.indexLabel || "-";
      parts.push(
        `${indent}${label}. "${entry.title}" [chunks ${entry.chunkStart}–${entry.chunkEnd}]: ${entry.summary}`,
      );
    }
  }

  parts.push("");
}
