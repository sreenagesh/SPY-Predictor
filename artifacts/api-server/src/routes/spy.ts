import { Router, type IRouter } from "express";
import YahooFinanceClass from "yahoo-finance2";
import {
  GetSpyDataResponse,
  GetSpyPredictionResponse,
} from "@workspace/api-zod";
import {
  fetchSpyHistory,
  computeRsi,
  computeSma,
  computeEma,
  computeMacd,
  computeBollingerBands,
  computeAtr,
  computeScalpTargets,
  type OhlcvBar,
} from "../lib/spy-data.js";

const router: IRouter = Router();
const yf = new YahooFinanceClass();

// ─── Fetch hourly bars for Wyckoff analysis ────────────────────────────────────

async function fetchHourlyBars(daysBack = 30): Promise<OhlcvBar[]> {
  const now = new Date();
  const from = new Date(now.getTime() - daysBack * 24 * 3600 * 1000);
  try {
    const result = await yf.chart("SPY", {
      period1: from,
      period2: now,
      interval: "1h",
    });
    const quotes = result?.quotes ?? [];
    return quotes
      .filter((q: any) => q.close != null)
      .map((q: any) => ({
        date: new Date(q.date).toISOString(),
        open: q.open ?? q.close,
        high: q.high ?? q.close,
        low: q.low ?? q.close,
        close: q.close,
        volume: q.volume ?? 0,
      }));
  } catch {
    return [];
  }
}

// ─── Wyckoff phase classifier (hourly bars) ────────────────────────────────────

interface WyckoffPhase {
  phase: string;
  subPhase: string;
  description: string;
  bias: "bullish" | "bearish" | "neutral";
  pricePosition: number;
}

function computeWyckoffPhase(bars: OhlcvBar[], currentPrice: number): WyckoffPhase {
  const fallback: WyckoffPhase = {
    phase: "Unknown",
    subPhase: "Insufficient data",
    description: "Not enough hourly bars to classify Wyckoff phase.",
    bias: "neutral",
    pricePosition: 0.5,
  };
  if (bars.length < 40) return fallback;

  const recent40 = bars.slice(-40);
  const last10 = recent40.slice(-10);
  const prev10 = recent40.slice(-20, -10);

  const recent10High = Math.max(...last10.map(b => b.high));
  const recent10Low = Math.min(...last10.map(b => b.low));
  const prev10High = Math.max(...prev10.map(b => b.high));
  const prev10Low = Math.min(...prev10.map(b => b.low));

  const isHigherHighs = recent10High > prev10High;
  const isHigherLows = recent10Low > prev10Low;
  const isLowerHighs = recent10High < prev10High;
  const isLowerLows = recent10Low < prev10Low;

  const rangeHigh = Math.max(...recent40.map(b => b.high));
  const rangeLow = Math.min(...recent40.map(b => b.low));
  const range = rangeHigh - rangeLow;
  const pricePosition = range > 0 ? (currentPrice - rangeLow) / range : 0.5;

  const upVol = recent40.filter(b => b.close > b.open).reduce((s, b) => s + b.volume, 0);
  const dnVol = recent40.filter(b => b.close <= b.open).reduce((s, b) => s + b.volume, 0);
  const volBias = upVol > dnVol * 1.2 ? "buying" : dnVol > upVol * 1.2 ? "selling" : "balanced";

  // Calculate average volume of last 10 vs prev 10 (volume trend)
  const recentAvgVol = last10.reduce((s, b) => s + b.volume, 0) / 10;
  const prevAvgVol = prev10.reduce((s, b) => s + b.volume, 0) / 10;
  const volumeExpanding = recentAvgVol > prevAvgVol * 1.1;

  if (isLowerHighs && isLowerLows) {
    if (pricePosition < 0.25 && volBias === "selling" && volumeExpanding) {
      return {
        phase: "Accumulation",
        subPhase: "Phase A — Selling Climax",
        description: "Capitulation sell-off with climactic volume. Smart money begins absorbing supply. Watch for Automatic Rally (AR) and Secondary Test (ST) before potential markup.",
        bias: "neutral",
        pricePosition,
      };
    }
    if (pricePosition < 0.35) {
      return {
        phase: "Accumulation",
        subPhase: "Phase B/C — Building Cause",
        description: "Price testing lows with declining volume. Institutions quietly accumulating. A 'spring' (false break below support) is possible before a Sign of Strength breakout.",
        bias: "neutral",
        pricePosition,
      };
    }
    return {
      phase: "Markdown",
      subPhase: volumeExpanding ? "Active Markdown" : "Weak Rally Rejection",
      description: `Lower highs and lower lows on ${volumeExpanding ? "expanding" : "decreasing"} volume confirm the downtrend is intact. Distribution is complete. Rallies are sell opportunities until structure changes.`,
      bias: "bearish",
      pricePosition,
    };
  }

  if (isHigherHighs && isHigherLows) {
    if (pricePosition > 0.75 && volBias === "selling") {
      return {
        phase: "Distribution",
        subPhase: "Phase A/B — Buying Climax",
        description: "Price at highs with distribution volume signature. Smart money selling into strength. Watch for Upthrust After Distribution (UTAD) before markdown begins.",
        bias: "neutral",
        pricePosition,
      };
    }
    return {
      phase: "Markup",
      subPhase: pricePosition > 0.6 ? "Late Markup" : "Early Markup",
      description: `Higher highs and higher lows with ${volBias === "buying" ? "strong buying" : "balanced"} volume. Trend is up. Dips to support are buy opportunities.`,
      bias: "bullish",
      pricePosition,
    };
  }

  if (isLowerHighs && isHigherLows) {
    if (volBias === "selling") {
      return {
        phase: "Distribution",
        subPhase: "Phase C — Last Point of Supply",
        description: "Narrowing price range with selling pressure. Distribution near completion. A break below range lows would confirm markdown start.",
        bias: "bearish",
        pricePosition,
      };
    }
    return {
      phase: "Accumulation",
      subPhase: "Phase D/E — Sign of Strength",
      description: "Narrowing range with buying interest. Cause building for next markup. Watch for breakout above resistance on volume.",
      bias: "bullish",
      pricePosition,
    };
  }

  // Transition / consolidation
  return {
    phase: "Consolidation",
    subPhase: "Range-bound",
    description: "Mixed price structure — market digesting recent move. Await directional break before committing to trade.",
    bias: "neutral",
    pricePosition,
  };
}

// ─── Trend strength ─────────────────────────────────────────────────────────────

interface TrendStrength {
  label: string;
  score: number;
  direction: "bullish" | "bearish" | "neutral";
  components: { name: string; value: string; contribution: number }[];
}

function computeTrendStrength(
  closes: number[],
  currentPrice: number,
  sma20: number,
  sma50: number,
  sma200: number,
  macdHistogram: number,
): TrendStrength {
  const components: { name: string; value: string; contribution: number }[] = [];
  let score = 0;

  // Price vs SMA200 (weight: 30 — most important long-term signal)
  const priceVsSma200Pct = ((currentPrice - sma200) / sma200) * 100;
  const c1 = priceVsSma200Pct > 2 ? 30 : priceVsSma200Pct < -2 ? -30 : Math.round(priceVsSma200Pct * 7.5);
  score += c1;
  components.push({
    name: "Price vs 200 SMA",
    value: `${priceVsSma200Pct > 0 ? "+" : ""}${priceVsSma200Pct.toFixed(1)}%`,
    contribution: c1,
  });

  // SMA alignment (weight: 25)
  let c2 = 0;
  if (currentPrice > sma20 && sma20 > sma50) c2 = 25;
  else if (currentPrice < sma20 && sma20 < sma50) c2 = -25;
  else if (currentPrice > sma20) c2 = 10;
  else if (currentPrice < sma20) c2 = -10;
  score += c2;
  components.push({
    name: "SMA Stack (20/50)",
    value: currentPrice > sma20 && sma20 > sma50 ? "Bullish stack" : currentPrice < sma20 && sma20 < sma50 ? "Bearish stack" : "Mixed",
    contribution: c2,
  });

  // SMA50 vs SMA200 cross (weight: 20)
  const c3 = sma50 > sma200 * 1.005 ? 20 : sma50 < sma200 * 0.995 ? -20 : 0;
  score += c3;
  components.push({
    name: "50/200 Cross",
    value: sma50 > sma200 ? `Golden Cross (+${((sma50 / sma200 - 1) * 100).toFixed(1)}%)` : `Death Cross (${((sma50 / sma200 - 1) * 100).toFixed(1)}%)`,
    contribution: c3,
  });

  // MACD (weight: 15)
  const c4 = macdHistogram > 1 ? 15 : macdHistogram < -1 ? -15 : Math.round(macdHistogram * 10);
  score += c4;
  components.push({
    name: "MACD Histogram",
    value: macdHistogram.toFixed(2),
    contribution: c4,
  });

  // 10-day momentum (weight: 10)
  const lookback = Math.min(10, closes.length - 1);
  const momentum10d = ((currentPrice - closes[closes.length - 1 - lookback]) / closes[closes.length - 1 - lookback]) * 100;
  const c5 = momentum10d > 2 ? 10 : momentum10d < -2 ? -10 : Math.round(momentum10d * 3);
  score += c5;
  components.push({
    name: "10-day Momentum",
    value: `${momentum10d > 0 ? "+" : ""}${momentum10d.toFixed(1)}%`,
    contribution: c5,
  });

  const direction: "bullish" | "bearish" | "neutral" = score >= 15 ? "bullish" : score <= -15 ? "bearish" : "neutral";

  let label: string;
  if (score >= 65) label = "Strong Uptrend";
  else if (score >= 35) label = "Uptrend";
  else if (score >= 15) label = "Weak Uptrend";
  else if (score > -15) label = "Sideways / Choppy";
  else if (score > -35) label = "Weak Downtrend";
  else if (score > -65) label = "Downtrend";
  else label = "Strong Downtrend";

  return { label, score, direction, components };
}

// ─── Key reversal levels + 3 price targets ──────────────────────────────────────

interface MarketStructure {
  reversalLevels: { label: string; price: number; type: "support" | "resistance"; significance: number }[];
  targets: { t1: number; t2: number; t3: number; direction: "up" | "down" | "neutral" };
  nearestLevel: { label: string; price: number; type: "support" | "resistance" } | null;
}

function computeMarketStructure(
  bars: OhlcvBar[],
  currentPrice: number,
  sma20: number,
  sma50: number,
  sma200: number,
  direction: "bullish" | "bearish" | "neutral",
): MarketStructure {
  const levels: { label: string; price: number; type: "support" | "resistance"; significance: number }[] = [];

  // SMA levels
  if (sma20 !== currentPrice) {
    levels.push({ label: "20 SMA", price: Math.round(sma20 * 100) / 100, type: sma20 > currentPrice ? "resistance" : "support", significance: 2 });
  }
  if (sma50 !== currentPrice) {
    levels.push({ label: "50 SMA", price: Math.round(sma50 * 100) / 100, type: sma50 > currentPrice ? "resistance" : "support", significance: 3 });
  }
  if (sma200 !== currentPrice) {
    levels.push({ label: "200 SMA", price: Math.round(sma200 * 100) / 100, type: sma200 > currentPrice ? "resistance" : "support", significance: 5 });
  }

  // Swing highs/lows from daily bars
  const closes = bars.map(b => b.close);
  const highs = bars.map(b => b.high);
  const lows = bars.map(b => b.low);

  // Find significant pivot highs (local maxima)
  for (let i = 3; i < bars.length - 3; i++) {
    if (highs[i] > highs[i - 1] && highs[i] > highs[i - 2] &&
        highs[i] > highs[i + 1] && highs[i] > highs[i + 2]) {
      const level = Math.round(highs[i] * 100) / 100;
      // Only keep if within 15% of current price
      if (Math.abs(level - currentPrice) / currentPrice < 0.15) {
        levels.push({
          label: `Swing High (${bars[i].date.slice(5, 10)})`,
          price: level,
          type: level > currentPrice ? "resistance" : "support",
          significance: 2,
        });
      }
    }
    // Pivot lows
    if (lows[i] < lows[i - 1] && lows[i] < lows[i - 2] &&
        lows[i] < lows[i + 1] && lows[i] < lows[i + 2]) {
      const level = Math.round(lows[i] * 100) / 100;
      if (Math.abs(level - currentPrice) / currentPrice < 0.15) {
        levels.push({
          label: `Swing Low (${bars[i].date.slice(5, 10)})`,
          price: level,
          type: level > currentPrice ? "resistance" : "support",
          significance: 2,
        });
      }
    }
  }

  // Round number levels (every $10) near current price
  const baseRound = Math.round(currentPrice / 10) * 10;
  for (let offset = -30; offset <= 30; offset += 10) {
    const roundLevel = baseRound + offset;
    if (roundLevel !== Math.round(currentPrice / 10) * 10) {
      levels.push({
        label: `$${roundLevel} round`,
        price: roundLevel,
        type: roundLevel > currentPrice ? "resistance" : "support",
        significance: roundLevel % 50 === 0 ? 4 : 1,
      });
    }
  }

  // Deduplicate: merge levels within $2 of each other
  const merged: typeof levels = [];
  const sorted = levels.sort((a, b) => a.price - b.price);
  for (const level of sorted) {
    const existing = merged.find(m => Math.abs(m.price - level.price) < 2);
    if (existing) {
      existing.significance = Math.max(existing.significance, level.significance);
      // Prefer named over round levels
      if (!existing.label.includes("round")) existing.label = existing.label;
      else existing.label = level.label;
    } else {
      merged.push({ ...level });
    }
  }

  // Sort by significance (high to low) and proximity (close to current price first within tiers)
  const finalLevels = merged
    .filter(l => Math.abs(l.price - currentPrice) > 0.5)
    .sort((a, b) => {
      if (b.significance !== a.significance) return b.significance - a.significance;
      return Math.abs(a.price - currentPrice) - Math.abs(b.price - currentPrice);
    })
    .slice(0, 8);

  // Compute targets
  const atr = computeAtr(bars, 14);
  let t1: number, t2: number, t3: number;
  const tDir = direction === "bearish" ? "down" : direction === "bullish" ? "up" : "neutral";

  if (direction === "bearish") {
    const supports = finalLevels.filter(l => l.type === "support").sort((a, b) => b.price - a.price);
    t1 = supports[0]?.price ?? Math.round((currentPrice - atr * 2) * 100) / 100;
    t2 = supports[1]?.price ?? Math.round((currentPrice - atr * 4) * 100) / 100;
    t3 = supports[2]?.price ?? Math.round((currentPrice - atr * 7) * 100) / 100;
  } else if (direction === "bullish") {
    const resistances = finalLevels.filter(l => l.type === "resistance").sort((a, b) => a.price - b.price);
    t1 = resistances[0]?.price ?? Math.round((currentPrice + atr * 2) * 100) / 100;
    t2 = resistances[1]?.price ?? Math.round((currentPrice + atr * 4) * 100) / 100;
    t3 = resistances[2]?.price ?? Math.round((currentPrice + atr * 7) * 100) / 100;
  } else {
    const recentHigh = Math.max(...bars.slice(-20).map(b => b.high));
    const recentLow = Math.min(...bars.slice(-20).map(b => b.low));
    t1 = Math.round((currentPrice + (recentHigh - currentPrice) * 0.5) * 100) / 100;
    t2 = recentHigh;
    t3 = Math.round((currentPrice - (currentPrice - recentLow) * 0.5) * 100) / 100;
  }

  const nearestLevels = finalLevels.sort((a, b) => Math.abs(a.price - currentPrice) - Math.abs(b.price - currentPrice));
  const nearestLevel = nearestLevels[0] ?? null;

  return {
    reversalLevels: finalLevels,
    targets: { t1, t2, t3, direction: tDir },
    nearestLevel,
  };
}

// ─── Tradier timesales (intraday bars) ─────────────────────────────────────────

function toEtString(d: Date): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(d);
  const g = (t: string) => parts.find((p) => p.type === t)?.value ?? "00";
  return `${g("year")}-${g("month")}-${g("day")} ${g("hour")}:${g("minute")}`;
}

async function fetchTradierTimesales(
  intervalStr: "1min" | "5min",
  hoursBack: number,
  limitBars?: number,
): Promise<OhlcvBar[]> {
  const TRADIER_TOKEN = process.env.TRADIER_API_KEY;
  if (!TRADIER_TOKEN) return [];

  const now = new Date();
  const from = new Date(now.getTime() - hoursBack * 3600 * 1000);
  const start = toEtString(from);
  const end = toEtString(now);

  try {
    const url = `https://api.tradier.com/v1/markets/timesales?symbol=SPY&interval=${intervalStr}&start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}&session_filter=open`;
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${TRADIER_TOKEN}`, Accept: "application/json" },
    });
    if (!response.ok) return [];
    const json = await response.json();
    const series = json?.series?.data;
    if (!series) return [];
    const arr: any[] = Array.isArray(series) ? series : [series];
    const bars = arr.map((bar) => ({
      date: bar.time,
      open: bar.open ?? bar.price,
      high: bar.high ?? bar.price,
      low: bar.low ?? bar.price,
      close: bar.close ?? bar.price,
      volume: bar.volume ?? 0,
    }));
    return limitBars ? bars.slice(-limitBars) : bars;
  } catch {
    return [];
  }
}

async function fetchYFIntraday(intervalStr: "1m" | "5m", hoursBack: number): Promise<OhlcvBar[]> {
  const now = new Date();
  const from = new Date(now.getTime() - hoursBack * 3600 * 1000);
  try {
    const result = await yf.chart("SPY", { period1: from, period2: now, interval: intervalStr });
    return (result?.quotes ?? [])
      .filter((q: any) => q.close != null)
      .map((q: any) => ({
        date: new Date(q.date).toISOString(),
        open: q.open ?? q.close,
        high: q.high ?? q.close,
        low: q.low ?? q.close,
        close: q.close,
        volume: q.volume ?? 0,
      }));
  } catch {
    return [];
  }
}

async function fetchIntradayBars(period: "1h" | "1d" | "1w"): Promise<OhlcvBar[]> {
  // 1W — Yahoo Finance hourly bars for the past 5 trading days
  if (period === "1w") {
    return fetchHourlyBars(5);
  }

  if (period === "1h") {
    // Try Tradier: last 2 days of 1-min bars, take the last 90 (= ~90 min of market activity)
    let bars = await fetchTradierTimesales("1min", 48, 90);
    if (bars.length < 3) {
      // Fallback: Yahoo Finance 1-min bars for last 3 days
      bars = await fetchYFIntraday("1m", 72);
      bars = bars.slice(-90); // last 90 traded bars
    }
    return bars;
  }

  // period === "1d": 5-min bars for the most recent full session
  let bars = await fetchTradierTimesales("5min", 48);
  // Keep only the most recent calendar day that has data
  if (bars.length > 0) {
    const lastDate = bars[bars.length - 1].date.slice(0, 10);
    bars = bars.filter((b) => b.date.startsWith(lastDate));
  }
  if (bars.length < 3) {
    // Fallback: Yahoo Finance 5-min bars for last 2 days
    bars = await fetchYFIntraday("5m", 48);
    if (bars.length > 0) {
      const lastDate = bars[bars.length - 1].date.slice(0, 10);
      bars = bars.filter((b) => b.date.startsWith(lastDate));
    }
  }
  return bars;
}

// ─── Data routes ───────────────────────────────────────────────────────────────

router.get("/spy/data", async (req, res): Promise<void> => {
  try {
    const period = (req.query.period as string) || "6mo";
    const intradayPeriods = ["1h", "1d", "1w"] as const;
    const longPeriods = ["1mo", "3mo", "6mo", "1y", "2y"];

    // ── Intraday / short-term periods via Tradier/Yahoo hourly ─────────────
    if ((intradayPeriods as readonly string[]).includes(period)) {
      const safePeriod = period as "1h" | "1d" | "1w";
      const bars = await fetchIntradayBars(safePeriod);

      if (bars.length === 0) {
        res.status(500).json({ error: "No intraday data available" });
        return;
      }

      const firstClose = bars[0].close;
      const lastClose = bars[bars.length - 1].close;
      const priceChange = lastClose - firstClose;
      const priceChangePct = (priceChange / firstClose) * 100;

      res.json({
        symbol: "SPY",
        period: safePeriod,
        bars,
        currentPrice: lastClose,
        priceChange,
        priceChangePct,
      });
      return;
    }

    // ── Historical daily bars ──────────────────────────────────────────────
    const safePeriod = longPeriods.includes(period) ? period : "6mo";
    const bars = await fetchSpyHistory(safePeriod);

    if (bars.length === 0) {
      res.status(500).json({ error: "No data available" });
      return;
    }

    const firstClose = bars[0].close;
    const lastClose = bars[bars.length - 1].close;
    const priceChange = lastClose - firstClose;
    const priceChangePct = (priceChange / firstClose) * 100;

    const data = GetSpyDataResponse.parse({
      symbol: "SPY",
      period: safePeriod,
      bars,
      currentPrice: lastClose,
      priceChange,
      priceChangePct,
    });

    res.json(data);
  } catch (err) {
    console.error("Error fetching SPY data:", err);
    res.status(500).json({ error: "Failed to fetch market data" });
  }
});

router.get("/spy/prediction", async (_req, res): Promise<void> => {
  try {
    const [bars, hourlyBars] = await Promise.all([
      fetchSpyHistory("1y"),  // Use 1y for proper SMA200
      fetchHourlyBars(20),
    ]);

    if (bars.length < 30) {
      res.status(500).json({ error: "Insufficient data for prediction" });
      return;
    }

    const closes = bars.map((b) => b.close);
    const currentPrice = closes[closes.length - 1];

    // ── Compute indicators ──────────────────────────────────────────────────
    const rsi = computeRsi(closes, 14);
    const sma20 = computeSma(closes, 20);
    const sma50 = computeSma(closes, 50);
    const sma200 = computeSma(closes, Math.min(200, closes.length));
    const macd = computeMacd(closes);
    const bb = computeBollingerBands(closes, 20);

    // ── Fixed signal logic ───────────────────────────────────────────────────

    // RSI: standard thresholds but 40/60 for directional bias
    const rsiSignal = rsi < 35 ? "bullish" : rsi > 65 ? "bearish" : rsi < 40 ? "neutral" : rsi > 60 ? "neutral" : "neutral";
    const rsiDesc = rsi < 35 ? "Oversold — potential bounce, but context matters in downtrends" :
                    rsi > 65 ? "Overbought — potential pullback ahead" :
                    `RSI at ${rsi.toFixed(1)} — neutral zone (watch for divergence)`;

    // SMA crossover: only bullish if ALL criteria align (bearish if any fail)
    const smaSignal: "bullish" | "bearish" | "neutral" =
      currentPrice > sma20 && sma20 > sma50 ? "bullish" :
      currentPrice < sma20 && sma20 < sma50 ? "bearish" : "neutral";

    // MACD
    const macdSignal: "bullish" | "bearish" | "neutral" =
      macd.histogram > 0.3 ? "bullish" :
      macd.histogram < -0.3 ? "bearish" : "neutral";

    // Bollinger Bands: near lower band is ONLY bullish if trend indicators support it
    // In a downtrend context, BB near lower band = continuation signal (neutral/bearish)
    const inDowntrendContext = currentPrice < sma200 && sma20 < sma50;
    const bbSignal: "bullish" | "bearish" | "neutral" =
      bb.percentB < 0.1 ? (inDowntrendContext ? "neutral" : "bullish") :
      bb.percentB > 0.9 ? "bearish" :
      bb.percentB < 0.25 ? (inDowntrendContext ? "neutral" : "bullish") :
      bb.percentB > 0.75 ? "bearish" : "neutral";

    // KEY FIX: Price vs SMA200 is a primary indicator (replaces the simplistic Golden Cross)
    const priceVsSma200Pct = ((currentPrice - sma200) / sma200) * 100;
    const priceVsSma200Signal: "bullish" | "bearish" | "neutral" =
      priceVsSma200Pct > 1.5 ? "bullish" :
      priceVsSma200Pct < -1.5 ? "bearish" : "neutral";

    // SMA50/SMA200 cross (kept as additional context)
    const goldenCrossSignal: "bullish" | "bearish" | "neutral" = sma50 > sma200 ? "bullish" : "bearish";

    // ── Weighted scoring (not just a count) ──────────────────────────────────
    const weightedScore = [
      { signal: priceVsSma200Signal, weight: 3 },  // Highest weight — primary trend
      { signal: smaSignal,           weight: 2.5 },
      { signal: macdSignal,          weight: 2 },
      { signal: goldenCrossSignal,   weight: 1.5 },
      { signal: rsiSignal,           weight: 1 },
      { signal: bbSignal,            weight: 0.5 },
    ];

    let weightedBull = 0, weightedBear = 0, totalWeight = 0;
    for (const { signal, weight } of weightedScore) {
      totalWeight += weight;
      if (signal === "bullish") weightedBull += weight;
      if (signal === "bearish") weightedBear += weight;
    }

    const bullPct = weightedBull / totalWeight;
    const bearPct = weightedBear / totalWeight;
    const netBias = bullPct - bearPct;

    let prediction: "bullish" | "bearish" | "neutral";
    let confidence: number;

    if (netBias > 0.25) {
      prediction = "bullish";
      confidence = 50 + Math.round(netBias * 100);
    } else if (netBias < -0.25) {
      prediction = "bearish";
      confidence = 50 + Math.round(Math.abs(netBias) * 100);
    } else {
      prediction = "neutral";
      confidence = 40 + Math.round(Math.abs(netBias) * 50);
    }
    confidence = Math.min(Math.max(confidence, 35), 92);

    // ── Trend strength + Wyckoff + market structure ──────────────────────────
    const trendStrength = computeTrendStrength(closes, currentPrice, sma20, sma50, sma200, macd.histogram);
    const wyckoff = computeWyckoffPhase(hourlyBars, currentPrice);
    const marketStructure = computeMarketStructure(bars.slice(-60), currentPrice, sma20, sma50, sma200, trendStrength.direction);

    // ── Price targets (from recent 20-bar range) ─────────────────────────────
    const recentBars = bars.slice(-20);
    const support = Math.min(...recentBars.map((b) => b.low));
    const resistance = Math.max(...recentBars.map((b) => b.high));
    const range = resistance - support;
    const upside = prediction === "bullish"
      ? Math.round((currentPrice + range * 0.6) * 100) / 100
      : Math.round((currentPrice + range * 0.3) * 100) / 100;
    const downside = prediction === "bearish"
      ? Math.round((currentPrice - range * 0.6) * 100) / 100
      : Math.round((currentPrice - range * 0.3) * 100) / 100;

    // ── Summary ──────────────────────────────────────────────────────────────
    const summaryParts: string[] = [];
    if (prediction === "bullish") {
      summaryParts.push(`SPY shows bullish momentum. Price is above its 200 SMA with improving technicals.`);
    } else if (prediction === "bearish") {
      summaryParts.push(`SPY is in a bearish regime: price is ${Math.abs(priceVsSma200Pct).toFixed(1)}% below its 200 SMA ($${sma200.toFixed(0)}), with ${trendStrength.label.toLowerCase()} conditions.`);
    } else {
      summaryParts.push(`Mixed signals — price is near its key SMAs. Await directional resolution before committing.`);
    }
    if (rsi < 35) summaryParts.push("RSI near oversold — watch for a tactical bounce, but don't fight the trend.");
    if (macd.histogram < -1) summaryParts.push(`MACD deeply negative (${macd.histogram.toFixed(2)}) — momentum is bearish.`);
    if (sma50 > sma200) summaryParts.push("Golden Cross still intact (SMA50 > SMA200) — but price is below both, indicating the cross may turn into a Death Cross.");
    else summaryParts.push("Death Cross in effect (SMA50 below SMA200). Institutional bias: bearish.");

    // ── Indicators list ──────────────────────────────────────────────────────
    const indicators = [
      {
        name: "Price vs 200 SMA",
        value: Math.round(priceVsSma200Pct * 100) / 100,
        signal: priceVsSma200Signal,
        description: `SPY ($${currentPrice.toFixed(2)}) is ${Math.abs(priceVsSma200Pct).toFixed(1)}% ${priceVsSma200Pct < 0 ? "BELOW" : "above"} the 200 SMA ($${sma200.toFixed(2)}) — ${priceVsSma200Signal === "bearish" ? "strongly bearish regime" : "bullish long-term position"}`,
      },
      {
        name: "SMA Stack (20/50)",
        value: Math.round((currentPrice / sma20 - 1) * 10000) / 100,
        signal: smaSignal,
        description: `Price $${currentPrice.toFixed(0)} vs SMA20 $${sma20.toFixed(0)} vs SMA50 $${sma50.toFixed(0)} — ${smaSignal === "bearish" ? "bearish cascade: price < SMA20 < SMA50" : smaSignal === "bullish" ? "bullish stack: price > SMA20 > SMA50" : "mixed SMA alignment"}`,
      },
      {
        name: "MACD",
        value: Math.round(macd.histogram * 100) / 100,
        signal: macdSignal,
        description: `MACD: ${macd.macd.toFixed(2)}, Signal: ${macd.signal.toFixed(2)}, Histogram: ${macd.histogram.toFixed(2)} — ${macd.histogram < 0 ? "bearish crossover, momentum accelerating down" : "bullish crossover"}`,
      },
      {
        name: "RSI (14)",
        value: Math.round(rsi * 100) / 100,
        signal: rsiSignal,
        description: rsiDesc,
      },
      {
        name: "50/200 SMA Cross",
        value: Math.round((sma50 / sma200 - 1) * 10000) / 100,
        signal: goldenCrossSignal,
        description: `SMA50 ($${sma50.toFixed(0)}) is ${sma50 > sma200 ? "above" : "below"} SMA200 ($${sma200.toFixed(0)}) by ${Math.abs(((sma50 / sma200 - 1) * 100)).toFixed(1)}% — ${sma50 > sma200 ? "Golden Cross, but narrowing gap" : "Death Cross"}`,
      },
      {
        name: "Bollinger Bands",
        value: Math.round(bb.percentB * 10000) / 100,
        signal: bbSignal,
        description: `Price at ${(bb.percentB * 100).toFixed(0)}% of BB range. Upper: $${bb.upper.toFixed(0)}, Lower: $${bb.lower.toFixed(0)}${inDowntrendContext ? " (lower band in downtrend = continuation, not reversal)" : ""}`,
      },
    ];

    const scalpTargets = computeScalpTargets(bars);

    const data = GetSpyPredictionResponse.parse({
      symbol: "SPY",
      timestamp: new Date().toISOString(),
      currentPrice,
      prediction,
      confidence: Math.round(confidence),
      summary: summaryParts.join(" "),
      indicators,
      priceTargets: {
        support: Math.round(support * 100) / 100,
        resistance: Math.round(resistance * 100) / 100,
        upside,
        downside,
      },
      scalpTargets,
      trendStrength,
      wyckoffPhase: wyckoff,
      marketStructure,
    });

    res.json(data);
  } catch (err) {
    console.error("Error computing SPY prediction:", err);
    res.status(500).json({ error: "Failed to compute prediction" });
  }
});

export default router;
