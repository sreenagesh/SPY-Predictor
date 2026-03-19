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

export function computeAtr(bars: OhlcvBar[], period = 14): number {
  if (bars.length < 2) return bars[0]?.high - bars[0]?.low || 1;
  const trValues: number[] = [];
  for (let i = 1; i < bars.length; i++) {
    const high = bars[i].high;
    const low = bars[i].low;
    const prevClose = bars[i - 1].close;
    const tr = Math.max(high - low, Math.abs(high - prevClose), Math.abs(low - prevClose));
    trValues.push(tr);
  }
  const recentTr = trValues.slice(-period);
  return recentTr.reduce((a, b) => a + b, 0) / recentTr.length;
}

export interface ScalpSetup {
  entry: number;
  t1: number;
  t2: number;
  stopLoss: number;
  riskReward: number;
}

export interface IntradayScalpTargets {
  bias: "long" | "short" | "neutral";
  atr: number;
  estimatedDayRange: number;
  longSetup: ScalpSetup;
  shortSetup: ScalpSetup;
  notes: string;
}

export function computeScalpTargets(
  bars: OhlcvBar[],
  prediction: "bullish" | "bearish" | "neutral",
  rsi: number,
  macdHistogram: number
): IntradayScalpTargets {
  const atr = computeAtr(bars, 14);
  const currentPrice = bars[bars.length - 1].close;

  const intradayRangeFactor = 0.45;
  const estimatedDayRange = atr * intradayRangeFactor;

  const t1Size = estimatedDayRange * 0.35;
  const t2Size = estimatedDayRange * 0.65;
  const stopSize = estimatedDayRange * 0.22;

  const round2 = (n: number) => Math.round(n * 100) / 100;

  const longEntry = round2(currentPrice);
  const longT1 = round2(longEntry + t1Size);
  const longT2 = round2(longEntry + t2Size);
  const longStop = round2(longEntry - stopSize);
  const longRR = round2(t1Size / stopSize);

  const shortEntry = round2(currentPrice);
  const shortT1 = round2(shortEntry - t1Size);
  const shortT2 = round2(shortEntry - t2Size);
  const shortStop = round2(shortEntry + stopSize);
  const shortRR = round2(t1Size / stopSize);

  let bias: "long" | "short" | "neutral";
  const rsiMomentum = rsi < 40 ? "oversold" : rsi > 60 ? "overbought" : "neutral";

  if (prediction === "bullish" || (prediction === "neutral" && rsi < 42 && macdHistogram > -0.5)) {
    bias = "long";
  } else if (prediction === "bearish" || (prediction === "neutral" && rsi > 58 && macdHistogram < 0.5)) {
    bias = "short";
  } else {
    bias = "neutral";
  }

  const noteMap: Record<string, string> = {
    long: `Bias skews long. ${rsiMomentum === "oversold" ? "RSI approaching oversold — watch for bounce entries on dips toward support." : "Look for pullbacks to VWAP or prior support as scalp long entries."}  ATR-based T1 at ${longT1.toFixed(2)}, T2 at ${longT2.toFixed(2)}, stop at ${longStop.toFixed(2)}.`,
    short: `Bias skews short. ${rsiMomentum === "overbought" ? "RSI elevated — look for rejection at resistance or failed breakout for entries." : "Watch for pops into resistance to fade intraday."}  ATR-based T1 at ${shortT1.toFixed(2)}, T2 at ${shortT2.toFixed(2)}, stop at ${shortStop.toFixed(2)}.`,
    neutral: `No clear intraday edge. Range-bound conditions expected. Consider fading extremes: long near ${longStop.toFixed(2)} support, short near ${shortStop.toFixed(2)} resistance. Reduce size and wait for confirmation.`,
  };

  return {
    bias,
    atr: round2(atr),
    estimatedDayRange: round2(estimatedDayRange),
    longSetup: { entry: longEntry, t1: longT1, t2: longT2, stopLoss: longStop, riskReward: longRR },
    shortSetup: { entry: shortEntry, t1: shortT1, t2: shortT2, stopLoss: shortStop, riskReward: shortRR },
    notes: noteMap[bias],
  };
}
