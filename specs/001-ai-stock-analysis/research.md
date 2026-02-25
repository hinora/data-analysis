# Research: AI Stock Analysis System

**Feature**: 001-ai-stock-analysis  
**Date**: 2026-02-13  
**Purpose**: Resolve technical unknowns and document technology decisions

## Research Tasks

### 1. Yahoo Finance Data Access

**Question**: How to fetch historical stock data from Yahoo Finance in Node.js?

**Research**:
- `yahoo-finance2` - Most popular Node.js library (npm: 500k+ weekly downloads)
- Provides: historical quotes, real-time quotes, search, options, etc.
- No API key required (uses public endpoints)
- Supports TypeScript out of the box

**Decision**: Use `yahoo-finance2` npm package
**Rationale**: Well-maintained, TypeScript support, no API key needed, widely used
**Alternatives Considered**:
- `yahoofinance-api` - Less maintained, fewer features
- Direct HTTP calls - Too much boilerplate, need to handle rate limiting manually

### 2. NewsAPI.org Integration

**Question**: How to integrate NewsAPI.org for news collection?

**Research**:
- Official `newsapi` npm package available
- Free tier: 100 requests/day, 1 month historical data
- Paid tier: Unlimited requests, full historical access
- Returns: title, description, content, source, publishedAt, url

**Decision**: Use `newsapi` npm package with axios fallback
**Rationale**: Official SDK, good TypeScript support, standard REST API for fallback
**Alternatives Considered**:
- Direct HTTP only - Loses typed responses

### 3. Finnhub News Integration

**Question**: How to integrate Finnhub for financial news?

**Research**:
- Official `finnhub` npm package available
- Free tier: 60 API calls/minute
- Provides: company news, market news, press releases
- Requires API key (free registration)

**Decision**: Use `finnhub` npm package
**Rationale**: Official SDK, financial-focused news, good for stock-specific content
**Alternatives Considered**:
- Direct REST calls - SDK handles rate limiting better

### 4. Reddit Integration

**Question**: How to collect posts from Reddit financial subreddits?

**Research**:
- `snoowrap` - Most popular Reddit API wrapper for Node.js
- Requires Reddit app credentials (free)
- Can search subreddits: r/stocks, r/wallstreetbets, r/investing
- Rate limit: 60 requests/minute (OAuth)

**Decision**: Use `snoowrap` npm package
**Rationale**: Full Reddit API access, good TypeScript support, handles OAuth
**Alternatives Considered**:
- `reddit-ts` - Less maintained
- Pushshift API - Deprecated/unreliable

### 5. RSS Feed Parsing

**Question**: How to parse RSS feeds from financial news sources?

**Research**:
- `rss-parser` - Most popular RSS parser (npm: 200k+ weekly downloads)
- Supports RSS 2.0, Atom 1.0
- Custom field extraction supported
- TypeScript definitions included

**Decision**: Use `rss-parser` npm package
**Rationale**: Widely used, well-maintained, handles various feed formats
**Alternatives Considered**:
- `feedparser` - Older, less TypeScript support
- `fast-xml-parser` + manual parsing - Too much work

### 6. Ollama Integration

**Question**: How to integrate Ollama AI for local inference?

**Research**:
- `ollama` - Official npm package from Ollama
- Supports: chat, generate, embeddings
- Streaming responses supported
- Local API on port 11434 by default

**Decision**: Use official `ollama` npm package
**Rationale**: Official SDK, actively maintained, full API coverage
**Alternatives Considered**:
- Direct HTTP calls - SDK handles streaming better
- LangChain.js - Overkill for direct Ollama usage

### 7. Job Scheduling

**Question**: How to implement daily scheduled job execution?

**Research**:
- `node-cron` - Simple cron-style scheduling (npm: 1M+ weekly downloads)
- `agenda` - MongoDB-backed job scheduling with persistence
- `bull` - Redis-backed job queue with retries

**Decision**: Use `agenda` for job scheduling
**Rationale**: MongoDB-backed (matches our stack), job persistence, retry support, distributed-safe
**Alternatives Considered**:
- `node-cron` - No persistence, loses jobs on restart
- `bull` - Requires Redis (additional infrastructure)
- Moleculer cron mixin - Less flexible for per-session scheduling

### 8. Stock Symbol Validation

**Question**: How to validate stock symbols against known exchanges?

**Research**:
- Yahoo Finance search API validates symbols
- `yahoo-finance2` has `search()` method that returns symbol data
- Can validate by checking if symbol returns market data

**Decision**: Use `yahoo-finance2.search()` for validation
**Rationale**: No additional dependency, validates against real market data
**Alternatives Considered**:
- Static symbol list - Gets stale, need updates
- Third-party validation API - Additional dependency

### 9. AI Adapter Pattern Implementation

**Question**: How to implement the adapter pattern for AI providers?

**Research**:
- Strategy pattern with factory function
- Common interface: `generateText(prompt, options): Promise<AIResponse>`
- Provider selected via environment variable
- Each adapter implements same interface

**Decision**: Factory pattern with interface
```typescript
interface AIAdapter {
  generateText(params: GenerateTextParams): Promise<GenerateTextResult>;
  generateJSON<T>(params: GenerateJSONParams): Promise<T>;
}

function createAIAdapter(provider?: string): AIAdapter {
  const providerName = provider || process.env.AI_PROVIDER || 'ollama';
  switch (providerName) {
    case 'ollama': return new OllamaAdapter();
    case 'gemini': return new GeminiAdapter();
    default: throw new Error(`Unknown AI provider: ${providerName}`);
  }
}
```
**Rationale**: Clean separation, easy to add providers, testable with mocks
**Alternatives Considered**:
- Class inheritance - More complex, less flexible
- Dependency injection framework - Overkill for this use case

### 10. Sentiment Scoring Approach

**Question**: How to normalize sentiment scores to [-1, 1] range per constitution?

**Research**:
- Ollama can return structured JSON with sentiment field
- Use JSON mode with schema validation
- Prompt engineering to request score in specific range

**Decision**: Use Ollama JSON mode with explicit scoring instructions
```typescript
const prompt = `Analyze sentiment and return JSON:
{
  "sentiment": <number between -1 (very negative) and 1 (very positive)>,
  "confidence": <number between 0 and 1>,
  "reasoning": "<brief explanation>"
}`;
```
**Rationale**: Consistent output format, constitution-compliant, verifiable
**Alternatives Considered**:
- Separate sentiment analysis library - Additional dependency
- Post-processing normalization - Less reliable

### 11. Recommendation Standards

**Question**: How to ensure recommendations follow constitution output standards?

**Research**:
- Constitution requires: STRONG_BUY, BUY, HOLD, SELL, STRONG_SELL, NO_OPINION
- Use TypeScript enum to enforce at compile time
- Validate AI output against enum values

**Decision**: TypeScript enum with runtime validation
```typescript
enum Recommendation {
  STRONG_BUY = 'STRONG_BUY',
  BUY = 'BUY',
  HOLD = 'HOLD',
  SELL = 'SELL',
  STRONG_SELL = 'STRONG_SELL',
  NO_OPINION = 'NO_OPINION'
}
```
**Rationale**: Type-safe, runtime validation, constitution-compliant
**Alternatives Considered**:
- String literals only - No compile-time safety
- Free-form recommendations - Violates constitution

## Dependency Summary

| Package | Version | Purpose |
|---------|---------|---------|
| `yahoo-finance2` | ^2.x | Stock data from Yahoo Finance |
| `newsapi` | ^2.x | NewsAPI.org integration |
| `finnhub` | ^1.x | Finnhub financial news |
| `snoowrap` | ^1.x | Reddit API wrapper |
| `rss-parser` | ^3.x | RSS feed parsing |
| `ollama` | ^0.5.x | Ollama AI integration |
| `agenda` | ^5.x | MongoDB-backed job scheduling |
| `mongoose` | ^8.x | MongoDB ODM (existing) |
| `axios` | ^1.x | HTTP client (existing) |

## Environment Variables

```bash
# AI Provider
AI_PROVIDER=ollama              # ollama | gemini
OLLAMA_HOST=http://localhost:11434
GEMINI_API_KEY=                 # Required if AI_PROVIDER=gemini

# Stock Data Provider
STOCK_DATA_PROVIDER=yahoo       # yahoo (only option for now)

# News Providers (API keys)
NEWSAPI_API_KEY=                # Required for NewsAPI.org
FINNHUB_API_KEY=                # Required for Finnhub
REDDIT_CLIENT_ID=               # Required for Reddit
REDDIT_CLIENT_SECRET=           # Required for Reddit
REDDIT_REFRESH_TOKEN=           # Required for Reddit

# Scheduler
DEFAULT_SCHEDULE_TIME=06:00     # Default daily run time (HH:MM local)
SCHEDULER_TIMEZONE=Asia/Ho_Chi_Minh

# Rate Limiting (constitution: max 100/min)
RATE_LIMIT_REQUESTS_PER_MINUTE=100
```

## Open Questions (None)

All technical questions resolved. Ready for Phase 1.
