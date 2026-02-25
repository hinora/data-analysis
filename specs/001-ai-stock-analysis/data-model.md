# Data Model: AI Stock Analysis System

**Feature**: 001-ai-stock-analysis  
**Date**: 2026-02-13  
**Database**: MongoDB with Mongoose ODM

## Entity Relationship Overview

```
┌─────────────────┐
│     Session     │
├─────────────────┤
│ _id             │
│ stockSymbol     │
│ companyName     │
│ status          │
│ dailySchedule   │──────┐
│ scheduleTime    │      │
│ newsSources[]   │      │
│ pipelineTimeout │      │
│ lastRunAt       │      │
│ createdAt       │      │
└────────┬────────┘      │
         │               │
         │ sessionId     │
         ▼               │
┌─────────────────┐      │
│HistoricalStock │      │
│     Data        │      │
├─────────────────┤      │
│ _id             │      │
│ sessionId       │      │
│ date            │      │      ┌─────────────────┐
│ open            │      │      │  DailyRunLog    │
│ close           │      │      ├─────────────────┤
│ high            │      └─────▶│ _id             │
│ low             │             │ sessionId       │
│ volume          │             │ runDate         │
│ source          │             │ scheduledTime   │
└─────────────────┘             │ agents[]        │
         │                      │ status          │
         │ sessionId            │ timeoutAt       │
         ▼                      │ timeoutReason   │
┌─────────────────┐             │ duration        │
│HistoricalAnal- │             └─────────────────┘
│     ysis        │
├─────────────────┤
│ _id             │
│ sessionId       │
│ trendSummary    │
│ volatility      │
│ growthRate      │
│ keyMetrics      │
│ generatedAt     │
└─────────────────┘

┌─────────────────┐
│    NewsItem     │
├─────────────────┤
│ _id             │
│ sessionId       │
│ externalId      │◄──── Unique per source
│ source          │
│ title           │
│ content         │
│ author          │
│ url             │
│ publishedAt     │
│ fetchedAt       │
│ engagement      │
└─────────────────┘
         │
         │ sessionId
         ▼
┌─────────────────┐
│  NewsSummary    │
├─────────────────┤
│ _id             │
│ sessionId       │
│ periodType      │◄──── monthly | yearly
│ periodStart     │
│ periodEnd       │
│ themes[]        │
│ sentiment       │
│ keyEvents[]     │
│ sourceBreakdown │
│ generatedAt     │
└─────────────────┘

┌─────────────────┐
│PredictionReport │
├─────────────────┤
│ _id             │
│ sessionId       │
│ sentimentRating │
│ trendPrediction │
│ recommendation  │
│ confidence      │
│ keyFactors[]    │
│ risks[]         │
│ opportunities[] │
│ advice          │
│ disclaimer      │
│ dataSources     │
│ generatedAt     │
└─────────────────┘

┌─────────────────┐
│AIMessageHistory │
├─────────────────┤
│ _id             │
│ sessionId       │
│ runId           │
│ agentType       │
│ model           │
│ provider        │
│ messages[]      │
│ totalTokens     │
│ duration        │
│ success         │
│ error           │
│ createdAt       │
└─────────────────┘
```

## Schema Definitions

### Session

**Collection**: `sessions`  
**Service**: `domain.analysis/microservice.session`

```typescript
import { Schema, model, Document } from 'mongoose';

export enum SessionStatus {
  INITIALIZING = 'initializing',
  ANALYZING = 'analyzing',
  COMPLETE = 'complete',
  ERROR = 'error'
}

export enum NewsSource {
  NEWSAPI = 'newsapi',
  FINNHUB = 'finnhub',
  REDDIT = 'reddit',
  RSS = 'rss'
}

export interface ISession extends Document {
  stockSymbol: string;
  companyName: string;
  status: SessionStatus;
  dailyScheduleEnabled: boolean;
  scheduleTime: string | null;        // HH:MM format, null = use system default
  newsSources: NewsSource[];
  pipelineTimeoutMinutes: number;     // Timeout for AI pipeline, default 10 min
  lastRunAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const sessionSchema = new Schema<ISession>({
  stockSymbol: {
    type: String,
    required: true,
    uppercase: true,
    index: true
  },
  companyName: {
    type: String,
    required: true
  },
  status: {
    type: String,
    enum: Object.values(SessionStatus),
    default: SessionStatus.INITIALIZING
  },
  dailyScheduleEnabled: {
    type: Boolean,
    default: false
  },
  scheduleTime: {
    type: String,
    default: null,
    validate: {
      validator: (v: string | null) => v === null || /^([01]\d|2[0-3]):([0-5]\d)$/.test(v),
      message: 'Schedule time must be in HH:MM format'
    }
  },
  newsSources: {
    type: [String],
    enum: Object.values(NewsSource),
    validate: {
      validator: (v: string[]) => v.length >= 1,
      message: 'At least one news source is required'
    }
  },
  pipelineTimeoutMinutes: {
    type: Number,
    default: 10,
    min: 1,
    max: 60
  },
  lastRunAt: {
    type: Date,
    default: null
  }
}, {
  timestamps: true
});

// Compound index for duplicate session check
sessionSchema.index({ stockSymbol: 1, createdAt: -1 });

export const Session = model<ISession>('Session', sessionSchema);
```

### HistoricalStockData

**Collection**: `historicalStockData`  
**Service**: `domain.data/microservice.stock`

```typescript
import { Schema, model, Document, Types } from 'mongoose';

export interface IHistoricalStockData extends Document {
  sessionId: Types.ObjectId;
  date: Date;
  open: number;
  close: number;
  high: number;
  low: number;
  volume: number;
  adjustedClose: number;
  source: string;              // e.g., 'yahoo'
  fetchedAt: Date;
}

const historicalStockDataSchema = new Schema<IHistoricalStockData>({
  sessionId: {
    type: Schema.Types.ObjectId,
    ref: 'Session',
    required: true,
    index: true
  },
  date: {
    type: Date,
    required: true
  },
  open: {
    type: Number,
    required: true
  },
  close: {
    type: Number,
    required: true
  },
  high: {
    type: Number,
    required: true
  },
  low: {
    type: Number,
    required: true
  },
  volume: {
    type: Number,
    required: true
  },
  adjustedClose: {
    type: Number,
    required: true
  },
  source: {
    type: String,
    required: true
  },
  fetchedAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: false
});

// Prevent duplicate entries for same session + date
historicalStockDataSchema.index({ sessionId: 1, date: 1 }, { unique: true });

// For querying date ranges
historicalStockDataSchema.index({ sessionId: 1, date: -1 });

export const HistoricalStockData = model<IHistoricalStockData>(
  'HistoricalStockData',
  historicalStockDataSchema
);
```

### HistoricalAnalysis

**Collection**: `historicalAnalyses`  
**Service**: `domain.ai/microservice.agents`

```typescript
import { Schema, model, Document, Types } from 'mongoose';

export interface IKeyMetric {
  name: string;
  value: number;
  unit: string;
  description: string;
}

export interface IHistoricalAnalysis extends Document {
  sessionId: Types.ObjectId;
  trendSummary: string;
  volatility: {
    score: number;           // 0-1 scale
    description: string;
  };
  growthRate: {
    percentage: number;
    period: string;          // e.g., "2 years"
  };
  highestPoint: {
    price: number;
    date: Date;
  };
  lowestPoint: {
    price: number;
    date: Date;
  };
  averagePrice: number;
  keyMetrics: IKeyMetric[];
  dataPointsAnalyzed: number;
  dateRangeStart: Date;
  dateRangeEnd: Date;
  generatedAt: Date;
}

const historicalAnalysisSchema = new Schema<IHistoricalAnalysis>({
  sessionId: {
    type: Schema.Types.ObjectId,
    ref: 'Session',
    required: true,
    index: true
  },
  trendSummary: {
    type: String,
    required: true
  },
  volatility: {
    score: { type: Number, required: true, min: 0, max: 1 },
    description: { type: String, required: true }
  },
  growthRate: {
    percentage: { type: Number, required: true },
    period: { type: String, required: true }
  },
  highestPoint: {
    price: { type: Number, required: true },
    date: { type: Date, required: true }
  },
  lowestPoint: {
    price: { type: Number, required: true },
    date: { type: Date, required: true }
  },
  averagePrice: {
    type: Number,
    required: true
  },
  keyMetrics: [{
    name: { type: String, required: true },
    value: { type: Number, required: true },
    unit: { type: String, required: true },
    description: { type: String, required: true }
  }],
  dataPointsAnalyzed: {
    type: Number,
    required: true
  },
  dateRangeStart: {
    type: Date,
    required: true
  },
  dateRangeEnd: {
    type: Date,
    required: true
  },
  generatedAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: false
});

// Latest analysis per session
historicalAnalysisSchema.index({ sessionId: 1, generatedAt: -1 });

export const HistoricalAnalysis = model<IHistoricalAnalysis>(
  'HistoricalAnalysis',
  historicalAnalysisSchema
);
```

### NewsItem

**Collection**: `newsItems`  
**Service**: `domain.data/microservice.news`

```typescript
import { Schema, model, Document, Types } from 'mongoose';
import { NewsSource } from './session.model';

export interface IEngagement {
  likes?: number;
  comments?: number;
  shares?: number;
  score?: number;           // Reddit upvote score
}

export interface INewsItem extends Document {
  sessionId: Types.ObjectId;
  externalId: string;        // Unique ID from source (post ID, article ID)
  source: NewsSource;
  title: string;
  content: string;
  author: string | null;
  url: string;
  publishedAt: Date;
  fetchedAt: Date;
  engagement: IEngagement;
}

const newsItemSchema = new Schema<INewsItem>({
  sessionId: {
    type: Schema.Types.ObjectId,
    ref: 'Session',
    required: true,
    index: true
  },
  externalId: {
    type: String,
    required: true
  },
  source: {
    type: String,
    enum: Object.values(NewsSource),
    required: true
  },
  title: {
    type: String,
    required: true
  },
  content: {
    type: String,
    required: true
  },
  author: {
    type: String,
    default: null
  },
  url: {
    type: String,
    required: true
  },
  publishedAt: {
    type: Date,
    required: true
  },
  fetchedAt: {
    type: Date,
    default: Date.now
  },
  engagement: {
    likes: { type: Number },
    comments: { type: Number },
    shares: { type: Number },
    score: { type: Number }
  }
}, {
  timestamps: false
});

// Prevent duplicate entries per session + source + externalId
newsItemSchema.index({ sessionId: 1, source: 1, externalId: 1 }, { unique: true });

// For chronological queries
newsItemSchema.index({ sessionId: 1, publishedAt: -1 });

// For source-filtered queries
newsItemSchema.index({ sessionId: 1, source: 1, publishedAt: -1 });

export const NewsItem = model<INewsItem>('NewsItem', newsItemSchema);
```

### NewsSummary

**Collection**: `newsSummaries`  
**Service**: `domain.ai/microservice.agents`

```typescript
import { Schema, model, Document, Types } from 'mongoose';
import { NewsSource } from './session.model';

export enum PeriodType {
  MONTHLY = 'monthly',
  YEARLY = 'yearly'
}

export interface ITheme {
  topic: string;
  frequency: number;
  sentiment: number;         // -1 to 1
}

export interface IKeyEvent {
  date: Date;
  title: string;
  impact: 'positive' | 'negative' | 'neutral';
  summary: string;
}

export interface ISourceBreakdown {
  source: NewsSource;
  count: number;
  averageSentiment: number;
}

export interface INewsSummary extends Document {
  sessionId: Types.ObjectId;
  periodType: PeriodType;
  periodStart: Date;
  periodEnd: Date;
  themes: ITheme[];
  overallSentiment: number;   // -1 to 1
  keyEvents: IKeyEvent[];
  sourceBreakdown: ISourceBreakdown[];
  articleCount: number;
  generatedAt: Date;
}

const newsSummarySchema = new Schema<INewsSummary>({
  sessionId: {
    type: Schema.Types.ObjectId,
    ref: 'Session',
    required: true,
    index: true
  },
  periodType: {
    type: String,
    enum: Object.values(PeriodType),
    required: true
  },
  periodStart: {
    type: Date,
    required: true
  },
  periodEnd: {
    type: Date,
    required: true
  },
  themes: [{
    topic: { type: String, required: true },
    frequency: { type: Number, required: true },
    sentiment: { type: Number, required: true, min: -1, max: 1 }
  }],
  overallSentiment: {
    type: Number,
    required: true,
    min: -1,
    max: 1
  },
  keyEvents: [{
    date: { type: Date, required: true },
    title: { type: String, required: true },
    impact: { type: String, enum: ['positive', 'negative', 'neutral'], required: true },
    summary: { type: String, required: true }
  }],
  sourceBreakdown: [{
    source: { type: String, enum: Object.values(NewsSource), required: true },
    count: { type: Number, required: true },
    averageSentiment: { type: Number, required: true, min: -1, max: 1 }
  }],
  articleCount: {
    type: Number,
    required: true
  },
  generatedAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: false
});

// Unique summary per session + period
newsSummarySchema.index(
  { sessionId: 1, periodType: 1, periodStart: 1 },
  { unique: true }
);

export const NewsSummary = model<INewsSummary>('NewsSummary', newsSummarySchema);
```

### PredictionReport

**Collection**: `predictionReports`  
**Service**: `domain.ai/microservice.agents`

```typescript
import { Schema, model, Document, Types } from 'mongoose';

export enum TrendPrediction {
  BULLISH = 'bullish',
  BEARISH = 'bearish',
  NEUTRAL = 'neutral'
}

export enum Recommendation {
  STRONG_BUY = 'STRONG_BUY',
  BUY = 'BUY',
  HOLD = 'HOLD',
  SELL = 'SELL',
  STRONG_SELL = 'STRONG_SELL',
  NO_OPINION = 'NO_OPINION'
}

export interface IKeyFactor {
  factor: string;
  impact: 'positive' | 'negative' | 'neutral';
  weight: number;            // 0-1
  source: string;            // e.g., 'historical', 'news'
}

export interface IRisk {
  description: string;
  severity: 'low' | 'medium' | 'high';
  mitigation: string;
}

export interface IOpportunity {
  description: string;
  confidence: number;        // 0-1
  timeHorizon: string;       // e.g., "7 days", "1 month"
}

export interface IDataSource {
  type: 'historical' | 'news';
  count: number;
  dateRange: {
    start: Date;
    end: Date;
  };
}

export interface IPredictionReport extends Document {
  sessionId: Types.ObjectId;
  sentimentRating: number;   // -1 to 1
  trendPrediction: TrendPrediction;
  recommendation: Recommendation;
  confidence: number;        // 0-1
  keyFactors: IKeyFactor[];
  risks: IRisk[];
  opportunities: IOpportunity[];
  advice: string;
  disclaimer: string;
  dataSources: IDataSource[];
  generatedAt: Date;
}

const predictionReportSchema = new Schema<IPredictionReport>({
  sessionId: {
    type: Schema.Types.ObjectId,
    ref: 'Session',
    required: true,
    index: true
  },
  sentimentRating: {
    type: Number,
    required: true,
    min: -1,
    max: 1
  },
  trendPrediction: {
    type: String,
    enum: Object.values(TrendPrediction),
    required: true
  },
  recommendation: {
    type: String,
    enum: Object.values(Recommendation),
    required: true
  },
  confidence: {
    type: Number,
    required: true,
    min: 0,
    max: 1
  },
  keyFactors: [{
    factor: { type: String, required: true },
    impact: { type: String, enum: ['positive', 'negative', 'neutral'], required: true },
    weight: { type: Number, required: true, min: 0, max: 1 },
    source: { type: String, required: true }
  }],
  risks: [{
    description: { type: String, required: true },
    severity: { type: String, enum: ['low', 'medium', 'high'], required: true },
    mitigation: { type: String, required: true }
  }],
  opportunities: [{
    description: { type: String, required: true },
    confidence: { type: Number, required: true, min: 0, max: 1 },
    timeHorizon: { type: String, required: true }
  }],
  advice: {
    type: String,
    required: true
  },
  disclaimer: {
    type: String,
    required: true,
    default: 'This analysis is AI-generated and does not constitute professional financial advice. Always consult with a qualified financial advisor before making investment decisions.'
  },
  dataSources: [{
    type: { type: String, enum: ['historical', 'news'], required: true },
    count: { type: Number, required: true },
    dateRange: {
      start: { type: Date, required: true },
      end: { type: Date, required: true }
    }
  }],
  generatedAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: false
});

// For fetching prediction history
predictionReportSchema.index({ sessionId: 1, generatedAt: -1 });

export const PredictionReport = model<IPredictionReport>(
  'PredictionReport',
  predictionReportSchema
);
```

### DailyRunLog

**Collection**: `dailyRunLogs`  
**Service**: `domain.scheduler/microservice.scheduler`

```typescript
import { Schema, model, Document, Types } from 'mongoose';

export enum AgentStatus {
  SUCCESS = 'success',
  FAILED = 'failed',
  SKIPPED = 'skipped',
  PARTIAL = 'partial'
}

export enum RunStatus {
  RUNNING = 'running',
  COMPLETED = 'completed',
  FAILED = 'failed',
  TIMEOUT = 'timeout',
  PARTIAL = 'partial'
}

export interface IAgentResult {
  agent: 'historical' | 'news' | 'prediction';
  status: AgentStatus;
  startedAt: Date;
  completedAt: Date | null;
  duration: number | null;   // milliseconds
  error: string | null;
  itemsProcessed: number;
}

export interface IDailyRunLog extends Document {
  sessionId: Types.ObjectId;
  runDate: Date;
  scheduledTime: string;     // HH:MM
  status: RunStatus;
  agents: IAgentResult[];
  totalDuration: number | null;
  startedAt: Date;
  completedAt: Date | null;
  timeoutAt: Date;           // When pipeline should timeout
  timeoutReason: string | null;  // Error message if timed out
}

const dailyRunLogSchema = new Schema<IDailyRunLog>({
  sessionId: {
    type: Schema.Types.ObjectId,
    ref: 'Session',
    required: true,
    index: true
  },
  runDate: {
    type: Date,
    required: true
  },
  scheduledTime: {
    type: String,
    required: true
  },
  status: {
    type: String,
    enum: Object.values(RunStatus),
    default: RunStatus.RUNNING
  },
  agents: [{
    agent: { 
      type: String, 
      enum: ['historical', 'news', 'prediction'], 
      required: true 
    },
    status: { 
      type: String, 
      enum: Object.values(AgentStatus), 
      required: true 
    },
    startedAt: { type: Date, required: true },
    completedAt: { type: Date },
    duration: { type: Number },
    error: { type: String },
    itemsProcessed: { type: Number, default: 0 }
  }],
  totalDuration: {
    type: Number,
    default: null
  },
  startedAt: {
    type: Date,
    default: Date.now
  },
  completedAt: {
    type: Date,
    default: null
  },
  timeoutAt: {
    type: Date,
    required: true
  },
  timeoutReason: {
    type: String,
    default: null
  }
}, {
  timestamps: false
});

// Prevent duplicate runs for same session on same date
dailyRunLogSchema.index({ sessionId: 1, runDate: 1 }, { unique: true });

// For querying run history
dailyRunLogSchema.index({ sessionId: 1, startedAt: -1 });

// For finding running jobs (to prevent concurrent execution)
dailyRunLogSchema.index({ sessionId: 1, status: 1 });

// For finding jobs that should be timed out
dailyRunLogSchema.index({ status: 1, timeoutAt: 1 });

export const DailyRunLog = model<IDailyRunLog>('DailyRunLog', dailyRunLogSchema);
```

### AIMessageHistory

**Collection**: `aiMessageHistory`  
**Service**: `domain.ai/microservice.agents`

Stores the message history of AI agent conversations for debugging and auditing purposes.

```typescript
import { Schema, model, Document, Types } from 'mongoose';

export enum AgentType {
  HISTORICAL = 'historical',
  NEWS = 'news',
  PREDICTION = 'prediction'
}

export enum MessageRole {
  SYSTEM = 'system',
  USER = 'user',
  ASSISTANT = 'assistant'
}

export interface IMessage {
  role: MessageRole;
  content: string;
  timestamp: Date;
  tokenCount?: number;
}

export interface IAIMessageHistory extends Document {
  sessionId: Types.ObjectId;
  runId: Types.ObjectId | null;
  agentType: AgentType;
  model: string;
  provider: string;
  messages: IMessage[];
  totalTokens: number;
  promptTokens: number;
  completionTokens: number;
  duration: number;
  success: boolean;
  error: string | null;
  metadata: {
    temperature?: number;
    maxTokens?: number;
    topP?: number;
    requestId?: string;
  };
  createdAt: Date;
}

const messageSchema = new Schema<IMessage>({
  role: {
    type: String,
    enum: Object.values(MessageRole),
    required: true
  },
  content: {
    type: String,
    required: true
  },
  timestamp: {
    type: Date,
    default: Date.now
  },
  tokenCount: {
    type: Number,
    default: null
  }
}, { _id: false });

const aiMessageHistorySchema = new Schema<IAIMessageHistory>({
  sessionId: {
    type: Schema.Types.ObjectId,
    ref: 'Session',
    required: true,
    index: true
  },
  runId: {
    type: Schema.Types.ObjectId,
    ref: 'DailyRunLog',
    default: null,
    index: true
  },
  agentType: {
    type: String,
    enum: Object.values(AgentType),
    required: true,
    index: true
  },
  model: {
    type: String,
    required: true
  },
  provider: {
    type: String,
    required: true,
    default: 'ollama'
  },
  messages: {
    type: [messageSchema],
    required: true,
    validate: {
      validator: (v: IMessage[]) => v.length >= 1,
      message: 'At least one message is required'
    }
  },
  totalTokens: {
    type: Number,
    default: 0
  },
  promptTokens: {
    type: Number,
    default: 0
  },
  completionTokens: {
    type: Number,
    default: 0
  },
  duration: {
    type: Number,
    required: true,
    default: 0
  },
  success: {
    type: Boolean,
    required: true,
    default: true
  },
  error: {
    type: String,
    default: null
  },
  metadata: {
    temperature: { type: Number },
    maxTokens: { type: Number },
    topP: { type: Number },
    requestId: { type: String }
  }
}, {
  timestamps: { createdAt: true, updatedAt: false }
});

// For fetching message history by session
aiMessageHistorySchema.index({ sessionId: 1, createdAt: -1 });

// For fetching message history by run
aiMessageHistorySchema.index({ runId: 1, agentType: 1 });

// For debugging failed requests
aiMessageHistorySchema.index({ success: 1, createdAt: -1 });

// For filtering by agent type and time
aiMessageHistorySchema.index({ agentType: 1, createdAt: -1 });

export const AIMessageHistory = model<IAIMessageHistory>(
  'AIMessageHistory',
  aiMessageHistorySchema
);
```

## Database Distribution

| Service | Database | Collections |
|---------|----------|-------------|
| `domain.analysis/microservice.session` | `analysisDb` | sessions |
| `domain.data/microservice.stock` | `stockDb` | historicalStockData |
| `domain.data/microservice.news` | `newsDb` | newsItems |
| `domain.ai/microservice.agents` | `aiDb` | historicalAnalyses, newsSummaries, predictionReports, aiMessageHistory |
| `domain.scheduler/microservice.scheduler` | `schedulerDb` | dailyRunLogs |

## Validation Rules Summary

| Entity | Field | Validation |
|--------|-------|------------|
| Session | newsSources | Min 1 required |
| Session | scheduleTime | HH:MM format or null |
| Session | pipelineTimeoutMinutes | Range [1, 60], default 10 |
| HistoricalStockData | sessionId + date | Unique compound |
| NewsItem | sessionId + source + externalId | Unique compound |
| NewsSummary | sessionId + periodType + periodStart | Unique compound |
| DailyRunLog | sessionId + runDate | Unique compound |
| DailyRunLog | timeoutAt | Required, calculated from session timeout |
| AIMessageHistory | messages | Min 1 required |
| All sentiment fields | value | Range [-1, 1] |
| All confidence fields | value | Range [0, 1] |
