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
  histogramPrev: number; // previous bar's histogram for slope detection
}

export function computeMacd(closes: number[]): MacdResult {
  const ema12 = computeEma(closes, 12);
  const ema26 = computeEma(closes, 26);
  const macdLine = ema12.map((v, i) => v - ema26[i]);
  const signalLine = computeEma(macdLine, 9);
  const last = macdLine.length - 1;
  const histogram = macdLine[last] - signalLine[last];
  const histogramPrev = last > 0 ? macdLine[last - 1] - signalLine[last - 1] : histogram;
  return {
    macd: macdLine[last],
    signal: signalLine[last],
    histogram,
    histogramPrev,
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

// ─── Short-term momentum score ────────────────────────────────────────────────
// Returns a score from -100 to +100 based on short-term indicators only.
// Positive = bullish momentum, Negative = bearish momentum.
// Designed to follow the CURRENT trend, not long-term structure.
export function computeMomentumScore(bars: OhlcvBar[]): {
  score: number;
  factors: { label: string; score: number; detail: string }[];
} {
  const closes = bars.map(b => b.close);
  const n = closes.length;
  const factors: { label: string; score: number; detail: string }[] = [];

  // ── 1. EMA 8 vs EMA 21 crossover — PRIMARY trend filter (weight: ±30)
  const ema8arr = computeEma(closes, 8);
  const ema21arr = computeEma(closes, 21);
  const ema8 = ema8arr[n - 1];
  const ema21 = ema21arr[n - 1];
  const ema8prev = ema8arr[n - 2] ?? ema8;
  const ema21prev = ema21arr[n - 2] ?? ema21;

  if (ema8 > ema21) {
    const s = 30;
    factors.push({ label: "EMA 8/21", score: s, detail: `EMA8 ($${ema8.toFixed(2)}) > EMA21 ($${ema21.toFixed(2)}) — bullish crossover` });
  } else {
    const s = -30;
    factors.push({ label: "EMA 8/21", score: s, detail: `EMA8 ($${ema8.toFixed(2)}) < EMA21 ($${ema21.toFixed(2)}) — bearish crossover` });
  }

  // ── 2. EMA8 slope — is the short-term trend accelerating? (weight: ±18)
  const ema8slope = ema8 - ema8prev;
  if (ema8slope > 0.15) {
    factors.push({ label: "EMA8 Slope", score: 18, detail: `EMA8 rising (+${ema8slope.toFixed(2)}) — upward acceleration` });
  } else if (ema8slope > 0) {
    factors.push({ label: "EMA8 Slope", score: 8, detail: `EMA8 trending up slightly (+${ema8slope.toFixed(2)})` });
  } else if (ema8slope < -0.15) {
    factors.push({ label: "EMA8 Slope", score: -18, detail: `EMA8 falling (${ema8slope.toFixed(2)}) — downward acceleration` });
  } else {
    factors.push({ label: "EMA8 Slope", score: -8, detail: `EMA8 trending down slightly (${ema8slope.toFixed(2)})` });
  }

  // ── 3. Recent candle momentum — last 5 bars (weight: ±20)
  const recent5 = bars.slice(-5);
  const bullCandles = recent5.filter(b => b.close > b.open).length;
  const bearCandles = recent5.filter(b => b.close < b.open).length;
  const candleScore = (bullCandles - bearCandles) * 4; // -20 to +20
  const candleLabel = bullCandles > bearCandles
    ? `${bullCandles}/5 bullish candles — upward pressure`
    : bearCandles > bullCandles
    ? `${bearCandles}/5 bearish candles — downward pressure`
    : "Balanced candles — no directional edge";
  factors.push({ label: "Candle Momentum", score: candleScore, detail: candleLabel });

  // ── 4. Price vs EMA8 — are we above or below short-term average? (weight: ±15)
  const currentPrice = closes[n - 1];
  const prevPrice = closes[n - 2] ?? currentPrice;
  if (currentPrice > ema8) {
    factors.push({ label: "Price vs EMA8", score: 15, detail: `Price $${currentPrice.toFixed(2)} above EMA8 $${ema8.toFixed(2)} — bullish structure` });
  } else {
    factors.push({ label: "Price vs EMA8", score: -15, detail: `Price $${currentPrice.toFixed(2)} below EMA8 $${ema8.toFixed(2)} — bearish structure` });
  }

  // ── 5. MACD histogram direction AND slope (weight: ±18)
  const macd = computeMacd(closes);
  const histSlope = macd.histogram - macd.histogramPrev;
  if (macd.histogram > 0 && histSlope > 0) {
    factors.push({ label: "MACD", score: 18, detail: `Histogram positive & expanding (+${macd.histogram.toFixed(2)}) — accelerating up` });
  } else if (macd.histogram > 0 && histSlope <= 0) {
    factors.push({ label: "MACD", score: 8, detail: `Histogram positive but contracting (+${macd.histogram.toFixed(2)}) — momentum fading` });
  } else if (macd.histogram < 0 && histSlope < 0) {
    factors.push({ label: "MACD", score: -18, detail: `Histogram negative & expanding (${macd.histogram.toFixed(2)}) — accelerating down` });
  } else {
    factors.push({ label: "MACD", score: -8, detail: `Histogram negative but contracting (${macd.histogram.toFixed(2)}) — selling pressure easing` });
  }

  // ── 6. RSI — only meaningful at extremes, also check direction (weight: ±14)
  const rsi = computeRsi(closes, 14);
  const rsiPrev = computeRsi(closes.slice(0, -1), 14);
  const rsiRising = rsi > rsiPrev;
  if (rsi < 32) {
    factors.push({ label: "RSI", score: 14, detail: `RSI deeply oversold (${rsi.toFixed(1)}) — high-probability bounce setup` });
  } else if (rsi < 42 && rsiRising) {
    factors.push({ label: "RSI", score: 8, detail: `RSI oversold (${rsi.toFixed(1)}) & rising — bullish reversal building` });
  } else if (rsi > 68) {
    factors.push({ label: "RSI", score: -14, detail: `RSI deeply overbought (${rsi.toFixed(1)}) — pullback risk elevated` });
  } else if (rsi > 58 && !rsiRising) {
    factors.push({ label: "RSI", score: -8, detail: `RSI elevated (${rsi.toFixed(1)}) & falling — momentum rolling over` });
  } else {
    factors.push({ label: "RSI", score: 0, detail: `RSI neutral at ${rsi.toFixed(1)} — no extreme signal` });
  }

  const score = factors.reduce((sum, f) => sum + f.score, 0);
  return { score, factors };
}

// ─── Scalp Targets ───────────────────────────────────────────────────────────

export interface ScalpSetup {
  entry: number;
  t1: number;
  t2: number;
  stopLoss: number;
  riskReward: number;
}

export interface IntradayScalpTargets {
  bias: "long" | "short" | "neutral";
  score: number;
  atr: number;
  estimatedDayRange: number;
  longSetup: ScalpSetup;
  shortSetup: ScalpSetup;
  notes: string;
}

export function computeScalpTargets(bars: OhlcvBar[]): IntradayScalpTargets {
  const atr = computeAtr(bars, 14);
  const currentPrice = bars[bars.length - 1].close;
  const round2 = (n: number) => Math.round(n * 100) / 100;

  // Use short-term momentum score exclusively — no long-term bias
  const { score, factors } = computeMomentumScore(bars);

  // Intraday range estimate based on ATR
  const estimatedDayRange = round2(atr * 0.45);
  const t1Size = estimatedDayRange * 0.38;
  const t2Size = estimatedDayRange * 0.72;
  const stopSize = estimatedDayRange * 0.24;
  const rr = round2(t1Size / stopSize);

  const longSetup: ScalpSetup = {
    entry: round2(currentPrice),
    t1: round2(currentPrice + t1Size),
    t2: round2(currentPrice + t2Size),
    stopLoss: round2(currentPrice - stopSize),
    riskReward: rr,
  };
  const shortSetup: ScalpSetup = {
    entry: round2(currentPrice),
    t1: round2(currentPrice - t1Size),
    t2: round2(currentPrice - t2Size),
    stopLoss: round2(currentPrice + stopSize),
    riskReward: rr,
  };

  // Threshold: need score >= 25 or <= -25 for directional bias
  let bias: "long" | "short" | "neutral";
  if (score >= 25) bias = "long";
  else if (score <= -25) bias = "short";
  else bias = "neutral";

  // Build notes from top factors
  const topFactors = factors
    .filter(f => Math.abs(f.score) > 0)
    .sort((a, b) => Math.abs(b.score) - Math.abs(a.score))
    .slice(0, 3)
    .map(f => f.detail);

  const noteMap: Record<string, string> = {
    long: `Short-term momentum favors longs (score: +${score}). ${topFactors[0]}. T1 ${longSetup.t1.toFixed(2)}, T2 ${longSetup.t2.toFixed(2)}, stop ${longSetup.stopLoss.toFixed(2)}.`,
    short: `Short-term momentum favors shorts (score: ${score}). ${topFactors[0]}. T1 ${shortSetup.t1.toFixed(2)}, T2 ${shortSetup.t2.toFixed(2)}, stop ${shortSetup.stopLoss.toFixed(2)}.`,
    neutral: `Mixed signals (score: ${score}). ${topFactors[0] ?? "No dominant direction — wait for a clear break before entering."}`,
  };

  return {
    bias,
    score,
    atr: round2(atr),
    estimatedDayRange,
    longSetup,
    shortSetup,
    notes: noteMap[bias],
  };
}
