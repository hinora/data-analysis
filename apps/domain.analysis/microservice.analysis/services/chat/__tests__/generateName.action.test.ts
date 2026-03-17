/**
 * Tests for chat/generateName.action.ts
 */

import { AILog } from "core.lib/database";
import {
  aiDefaults,
  clearTestDatabase,
  createMockAIAdapter,
  createTestDataSource,
  defineTest,
  destroyTestDataSource,
} from "core.lib/testing";
import type { DataSource } from "typeorm";

const mockAI = createMockAIAdapter();

jest.mock("core.lib/adapters/ai", () => ({
  createAIAdapter: () => mockAI,
}));

let testDs: DataSource;

jest.mock("../../../db", () => ({
  get dataSource() {
    return testDs;
  },
}));

import generateNameAction from "../generateName.action";

beforeAll(async () => {
  testDs = await createTestDataSource([AILog]);
});

afterAll(async () => {
  await destroyTestDataSource(testDs);
});

beforeEach(async () => {
  await clearTestDatabase(testDs, [AILog]);
  jest.clearAllMocks();
});

describe("chat.generateName action", () => {
  defineTest({
    name: "should generate a conversation name using AI",
    action: generateNameAction,
    params: {
      context: "What are the top 10 products by revenue?",
      target: "conversation" as const,
    },
    db: () => testDs,
    beforeTest: () => {
      mockAI.generateText.mockResolvedValueOnce({
        ...aiDefaults.textResult,
        content: '"Sales Data Overview"',
      });
    },
    assertResult: (result) => {
      expect(result.name).toBe("Sales Data Overview");
    },
  });

  defineTest({
    name: "should generate a session name using AI",
    action: generateNameAction,
    params: {
      context: "quarterly_reports.csv, income_statement.pdf",
      target: "session" as const,
    },
    db: () => testDs,
    beforeTest: () => {
      mockAI.generateText.mockResolvedValueOnce({
        ...aiDefaults.textResult,
        content: "Financial Data Analysis",
      });
    },
    assertResult: (result) => {
      expect(result.name).toBe("Financial Data Analysis");
    },
  });

  defineTest({
    name: "should log the AI interaction in the database",
    action: generateNameAction,
    params: { context: "test context", target: "session" as const },
    db: () => testDs,
    beforeTest: () => {
      mockAI.generateText.mockResolvedValueOnce({
        ...aiDefaults.textResult,
        content: "Test Name",
        completionTokens: 5,
        promptTokens: 20,
        totalTokens: 25,
      });
    },
    after: async (ds) => {
      const logs = await ds.getRepository(AILog).find();
      expect(logs).toHaveLength(1);
      expect(logs[0].responseReceived).toBe("Test Name");
      expect(logs[0].totalTokens).toBe(25);
    },
  });

  defineTest({
    name: "should truncate names that exceed the max length",
    action: generateNameAction,
    params: { context: "some context", target: "session" as const },
    db: () => testDs,
    beforeTest: () => {
      const longName = "A".repeat(600);
      mockAI.generateText.mockResolvedValueOnce({
        ...aiDefaults.textResult,
        content: longName,
      });
    },
    assertResult: (result) => {
      expect(result.name.length).toBeLessThanOrEqual(200);
    },
  });

  defineTest({
    name: "should call AI with correct parameters",
    action: generateNameAction,
    params: {
      context: "Test question",
      target: "conversation" as const,
    },
    db: () => testDs,
    beforeTest: () => {
      mockAI.generateText.mockResolvedValueOnce({
        ...aiDefaults.textResult,
        content: "Generated Name",
      });
    },
    assertResult: () => {
      expect(mockAI.generateText).toHaveBeenCalledTimes(1);
      expect(mockAI.generateText).toHaveBeenCalledWith(
        expect.objectContaining({
          prompt: "Test question",
          temperature: 0.7,
        }),
      );
    },
  });
});
