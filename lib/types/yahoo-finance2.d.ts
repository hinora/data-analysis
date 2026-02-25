/**
 * Type declarations for yahoo-finance2
 *
 * The yahoo-finance2 package exports ESM types that aren't compatible
 * with moduleResolution: "node". This adds basic type declarations.
 */

declare module "yahoo-finance2" {
  interface HistoricalResult {
    adjClose?: number;
    close: number;
    date: Date;
    high: number;
    low: number;
    open: number;
    volume: number;
  }

  interface QuoteResult {
    displayName?: string;
    exchange?: string;
    exchangeTimezoneName?: string;
    longName?: string;
    market?: string;
    marketCap?: number;
    quoteType?: string;
    regularMarketChange?: number;
    regularMarketChangePercent?: number;
    regularMarketDayHigh?: number;
    regularMarketDayLow?: number;
    regularMarketOpen?: number;
    regularMarketPreviousClose?: number;
    regularMarketPrice?: number;
    regularMarketTime?: number;
    regularMarketVolume?: number;
    shortName?: string;
    symbol: string;
  }

  interface HistoricalOptions {
    interval?: "1d" | "1wk" | "1mo";
    period1: Date | string | number;
    period2?: Date | string | number;
  }

  interface SearchResult {
    quotes: Array<{
      exchange?: string;
      longName?: string;
      shortName?: string;
      symbol: string;
    }>;
  }

  interface SearchOptions {
    newsCount?: number;
    quotesCount?: number;
  }

  interface YahooFinance {
    historical(
      symbol: string,
      options: HistoricalOptions,
    ): Promise<HistoricalResult[]>;
    quote(symbol: string): Promise<QuoteResult>;
    search(query: string, options?: SearchOptions): Promise<SearchResult>;
  }

  // v3.x exports the class, not an instance - instantiate with new YahooFinance()
  const YahooFinance: new () => YahooFinance;
  export default YahooFinance;
}
