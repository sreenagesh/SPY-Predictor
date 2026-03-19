import YahooFinanceClass from "yahoo-finance2";

const yahooFinance = new YahooFinanceClass();

export interface OhlcvBar {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export async function fetchSpyHistory(period: string): Promise<OhlcvBar[]> {
  const now = new Date();
  const periodMap: Record<string, { daysBack: number; interval: string }> = {
    "1mo": { daysBack: 30, interval: "1d" },
    "3mo": { daysBack: 90, interval: "1d" },
    "6mo": { daysBack: 180, interval: "1d" },
    "1y": { daysBack: 365, interval: "1wk" },
    "2y": { daysBack: 730, interval: "1wk" },
  };

  const cfg = periodMap[period] ?? periodMap["6mo"];
  const period1 = new Date(now.getTime() - cfg.daysBack * 24 * 60 * 60 * 1000);

  const result = await yahooFinance.chart("SPY", {
    period1,
    interval: cfg.interval as any,
  });

  if (!result.quotes || result.quotes.length === 0) {
    throw new Error("No data returned from Yahoo Finance");
  }

  return result.quotes
    .filter((q) => q.open != null && q.close != null)
    .map((q) => ({
      date: q.date instanceof Date ? q.date.toISOString() : String(q.date),
      open: q.open ?? 0,
      high: q.high ?? 0,
      low: q.low ?? 0,
      close: q.close ?? 0,
      volume: q.volume ?? 0,
    }));
}

export function computeRsi(closes: number[], period = 14): number {
  if (closes.length < period + 1) return 50;
  const gains: number[] = [];
  const losses: number[] = [];
  for (let i = 1; i <= period; i++) {
    const diff = closes[i] - closes[i - 1];
    gains.push(Math.max(diff, 0));
    losses.push(Math.max(-diff, 0));
  }
  let avgGain = gains.reduce((a, b) => a + b, 0) / period;
  let avgLoss = losses.reduce((a, b) => a + b, 0) / period;
  for (let i = period + 1; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];
    avgGain = (avgGain * (period - 1) + Math.max(diff, 0)) / period;
    avgLoss = (avgLoss * (period - 1) + Math.max(-diff, 0)) / period;
  }
  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - 100 / (1 + rs);
}

export function computeSma(closes: number[], period: number): number {
  if (closes.length < period) return closes[closes.length - 1] ?? 0;
  const slice = closes.slice(-period);
  return slice.reduce((a, b) => a + b, 0) / period;
}

export function computeEma(closes: number[], period: number): number[] {
  const k = 2 / (period + 1);
  const emas: number[] = [];
  let ema = closes[0];
  for (let i = 0; i < closes.length; i++) {
    ema = closes[i] * k + ema * (1 - k);
    emas.push(ema);
  }
  return emas;
}

export interface MacdResult {
  macd: number;
  signal: number;
  histogram: number;
}

export function computeMacd(closes: number[]): MacdResult {
  const ema12 = computeEma(closes, 12);
  const ema26 = computeEma(closes, 26);
  const macdLine = ema12.map((v, i) => v - ema26[i]);
  const signalLine = computeEma(macdLine, 9);
  const last = macdLine.length - 1;
  return {
    macd: macdLine[last],
    signal: signalLine[last],
    histogram: macdLine[last] - signalLine[last],
  };
}

export interface BollingerBands {
  upper: number;
  middle: number;
  lower: number;
  percentB: number;
}

export function computeBollingerBands(closes: number[], period = 20): BollingerBands {
  const slice = closes.slice(-period);
  const mean = slice.reduce((a, b) => a + b, 0) / slice.length;
  const variance = slice.reduce((a, b) => a + (b - mean) ** 2, 0) / slice.length;
  const std = Math.sqrt(variance);
  const upper = mean + 2 * std;
  const lower = mean - 2 * std;
  const current = closes[closes.length - 1];
  const percentB = upper === lower ? 0.5 : (current - lower) / (upper - lower);
  return { upper, middle: mean, lower, percentB };
}
