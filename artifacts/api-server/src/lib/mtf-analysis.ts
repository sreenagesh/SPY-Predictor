import YahooFinanceClass from "yahoo-finance2";
import {
  computeEma,
  computeMacd,
  computeRsi,
  computeAtr,
  OhlcvBar,
} from "./spy-data.js";
import { getMarketStatus } from "./market-utils.js";

const yahooFinance = new YahooFinanceClass();

// ─── Types ────────────────────────────────────────────────────────────────────

export interface TimeframeSnapshot {
  tf: "5m" | "15m" | "1h";
  score: number;
  trend: "bullish" | "bearish" | "neutral";
  ema8: number;
  ema21: number;
  emaAligned: boolean;
  rsi: number;
  macdHistogram: number;
  macdSlope: "up" | "down";
  keyFactor: string;
  atr: number;
}

export interface SessionLevels {
  todayOpen: number;
  sessionHigh: number;
  sessionLow: number;
  preMarketHigh: number | null;
  preMarketLow: number | null;
  distToHigh: number;
  distToLow: number;
}

export interface PivotLevels {
  support: number[];
  resistance: number[];
}

export interface VolumeContext {
  current: number;
  average: number;
  relative: number;   // current / average
  expanding: boolean;
  label: string;
}

export interface EntryWindow {
  name: string;
  isOptimal: boolean;
  isCaution: boolean;
  isDanger: boolean;
  minutesLeft: number | null;
  advice: string;
}

export interface ZeroDteIntel {
  entryQuality: "High" | "Medium" | "Low" | "Avoid";
  suggestedSide: "CALL" | "PUT" | "WAIT";
  riskRating: "Low" | "Medium" | "High" | "Extreme";
  entryWindow: EntryWindow;
  sessionLevels: SessionLevels;
  pivots: PivotLevels;
  volumeContext: VolumeContext;
  momentumAcceleration: "accelerating" | "steady" | "fading";
  vixProxy: number;
  expectedMove: number;
  tradingAdvice: string[];
}

export interface MtfAnalysis {
  timestamp: string;
  marketStatus: string;
  currentPrice: number;
  timeframes: {
    "5m": TimeframeSnapshot;
    "15m": TimeframeSnapshot;
    "1h": TimeframeSnapshot;
  };
  alignment: {
    score: number;
    direction: "bullish" | "mixed" | "bearish";
    label: string;
    confidence: number;
  };
  zeroDTE: ZeroDteIntel;
}

// ─── Bar fetching ─────────────────────────────────────────────────────────────

async function fetchBars(interval: string, daysBack: number): Promise<OhlcvBar[]> {
  const period1 = new Date(Date.now() - daysBack * 24 * 60 * 60 * 1000);
  const result = await yahooFinance.chart("SPY", {
    period1,
    interval: interval as any,
  });
  if (!result.quotes?.length) throw new Error(`No ${interval} data`);
  return result.quotes
    .filter(q => q.open != null && q.close != null)
    .map(q => ({
      date: q.date instanceof Date ? q.date.toISOString() : String(q.date),
      open: q.open ?? 0,
      high: q.high ?? 0,
      low: q.low ?? 0,
      close: q.close ?? 0,
      volume: q.volume ?? 0,
    }));
}

// ─── Momentum scoring (same algorithm, applied per timeframe) ─────────────────

function scoreBars(bars: OhlcvBar[], tf: "5m" | "15m" | "1h"): TimeframeSnapshot {
  const closes = bars.map(b => b.close);
  const n = closes.length;
  let score = 0;

  const ema8arr = computeEma(closes, 8);
  const ema21arr = computeEma(closes, 21);
  const ema8 = ema8arr[n - 1];
  const ema21 = ema21arr[n - 1];
  const ema8prev = ema8arr[n - 2] ?? ema8;

  // EMA crossover (±30)
  score += ema8 > ema21 ? 30 : -30;

  // EMA8 slope (±18)
  const slope = ema8 - ema8prev;
  score += slope > 0.15 ? 18 : slope > 0 ? 8 : slope < -0.15 ? -18 : -8;

  // Recent 5 candles (±20)
  const recent5 = bars.slice(-5);
  const bull5 = recent5.filter(b => b.close > b.open).length;
  const bear5 = recent5.filter(b => b.close < b.open).length;
  score += (bull5 - bear5) * 4;

  // Price vs EMA8 (±15)
  const price = closes[n - 1];
  score += price > ema8 ? 15 : -15;

  // MACD (±18)
  const macd = computeMacd(closes);
  const histSlope = macd.histogram - macd.histogramPrev;
  if (macd.histogram > 0 && histSlope > 0) score += 18;
  else if (macd.histogram > 0) score += 8;
  else if (macd.histogram < 0 && histSlope < 0) score -= 18;
  else score -= 8;

  // RSI extremes (±14)
  const rsi = computeRsi(closes, 14);
  if (rsi < 32) score += 14;
  else if (rsi > 68) score -= 14;

  const trend: "bullish" | "bearish" | "neutral" =
    score >= 25 ? "bullish" : score <= -25 ? "bearish" : "neutral";

  // Build key factor sentence
  let keyFactor: string;
  if (Math.abs(score) >= 50) {
    keyFactor = ema8 > ema21
      ? `Strong uptrend: EMA8 above EMA21, MACD ${macd.histogram > 0 ? "positive" : "negative"}, RSI ${rsi.toFixed(0)}`
      : `Strong downtrend: EMA8 below EMA21, MACD ${macd.histogram < 0 ? "negative" : "positive"}, RSI ${rsi.toFixed(0)}`;
  } else if (score > 0) {
    keyFactor = `Mild bullish bias (score +${score}): EMA8 ${ema8 > ema21 ? "above" : "below"} EMA21, RSI ${rsi.toFixed(0)}`;
  } else if (score < 0) {
    keyFactor = `Mild bearish bias (score ${score}): EMA8 ${ema8 > ema21 ? "above" : "below"} EMA21, RSI ${rsi.toFixed(0)}`;
  } else {
    keyFactor = `Neutral — no directional edge on ${tf} bars`;
  }

  return {
    tf,
    score: Math.max(-100, Math.min(100, score)),
    trend,
    ema8: Math.round(ema8 * 100) / 100,
    ema21: Math.round(ema21 * 100) / 100,
    emaAligned: ema8 > ema21,
    rsi: Math.round(rsi * 10) / 10,
    macdHistogram: Math.round(macd.histogram * 1000) / 1000,
    macdSlope: histSlope >= 0 ? "up" : "down",
    keyFactor,
    atr: Math.round(computeAtr(bars, 14) * 100) / 100,
  };
}

// ─── Session levels ───────────────────────────────────────────────────────────

function getSessionLevels(bars5m: OhlcvBar[], currentPrice: number): SessionLevels {
  // "Today" = bars from the most recent calendar date
  const lastBar = bars5m[bars5m.length - 1];
  const lastDate = lastBar.date.slice(0, 10);
  const todayBars = bars5m.filter(b => b.date.slice(0, 10) === lastDate);

  // Premarket: before 9:30 UTC-4/5 (13:30 or 14:30 UTC)
  const premarketBars = todayBars.filter(b => {
    const hour = new Date(b.date).getUTCHours();
    return hour < 13;
  });
  const sessionBars = todayBars.filter(b => {
    const hour = new Date(b.date).getUTCHours();
    return hour >= 13;
  });

  const todayOpen = sessionBars.length > 0 ? sessionBars[0].open : (todayBars[0]?.open ?? currentPrice);
  const sessionHigh = Math.max(...(sessionBars.length ? sessionBars : todayBars).map(b => b.high));
  const sessionLow  = Math.min(...(sessionBars.length ? sessionBars : todayBars).map(b => b.low));
  const preMarketHigh = premarketBars.length ? Math.max(...premarketBars.map(b => b.high)) : null;
  const preMarketLow  = premarketBars.length ? Math.min(...premarketBars.map(b => b.low)) : null;

  const r = (n: number) => Math.round(n * 100) / 100;
  return {
    todayOpen: r(todayOpen),
    sessionHigh: r(sessionHigh),
    sessionLow: r(sessionLow),
    preMarketHigh: preMarketHigh != null ? r(preMarketHigh) : null,
    preMarketLow:  preMarketLow  != null ? r(preMarketLow)  : null,
    distToHigh: r(sessionHigh - currentPrice),
    distToLow:  r(currentPrice - sessionLow),
  };
}

// ─── Pivot detection (swing H/L on 15-min bars) ───────────────────────────────

function detectPivots(bars: OhlcvBar[], currentPrice: number): PivotLevels {
  const highs: number[] = [];
  const lows: number[] = [];
  const window = 3;

  for (let i = window; i < bars.length - window; i++) {
    const h = bars[i].high;
    const l = bars[i].low;
    const isSwingHigh = bars.slice(i - window, i + window + 1).every(b => b.high <= h);
    const isSwingLow  = bars.slice(i - window, i + window + 1).every(b => b.low  >= l);
    if (isSwingHigh) highs.push(h);
    if (isSwingLow)  lows.push(l);
  }

  // Pick nearest 3 supports below and 3 resistances above
  const r = (n: number) => Math.round(n * 100) / 100;
  const support    = [...new Set(lows.filter(l => l < currentPrice).map(r))].sort((a, b) => b - a).slice(0, 3);
  const resistance = [...new Set(highs.filter(h => h > currentPrice).map(r))].sort((a, b) => a - b).slice(0, 3);

  return { support, resistance };
}

// ─── Volume context ───────────────────────────────────────────────────────────

function getVolumeContext(bars5m: OhlcvBar[]): VolumeContext {
  const vols = bars5m.map(b => b.volume);
  // Use the last bar with non-zero volume as "current"
  let currentIdx = vols.length - 1;
  while (currentIdx > 0 && vols[currentIdx] === 0) currentIdx--;
  const current = vols[currentIdx];
  const avgLen = Math.min(20, currentIdx);
  const sliceVols = vols.slice(Math.max(0, currentIdx - avgLen), currentIdx).filter(v => v > 0);
  const average = sliceVols.length > 0 ? sliceVols.reduce((a, b) => a + b, 0) / sliceVols.length : current;
  const relative = average > 0 ? Math.round((current / average) * 100) / 100 : 1;
  const expanding = relative >= 1.2;
  const label =
    relative >= 1.8 ? "Spike — strong institutional activity" :
    relative >= 1.4 ? "Elevated — trend confirmation" :
    relative >= 1.1 ? "Above average — moderate confirmation" :
    relative >= 0.85 ? "Normal volume" :
    relative >= 0.6 ? "Light — low conviction" :
    "Very low — avoid trading, possible trap";

  return { current, average: Math.round(average), relative, expanding, label };
}

// ─── Time-of-day entry window (EST) ──────────────────────────────────────────

function getEntryWindow(date = new Date()): EntryWindow {
  // Determine EST offset (EDT = UTC-4, EST = UTC-5)
  const month = date.getUTCMonth();
  const day   = date.getUTCDate();
  const offset = (month > 2 && month < 10) || (month === 2 && day >= 8) || (month === 10 && day < 7) ? 4 : 5;
  const minutes = ((date.getUTCHours() - offset + 24) % 24) * 60 + date.getUTCMinutes();

  const windows = [
    { start: 4*60,       end: 9*60+30,  name: "Pre-Market",          optimal: false, caution: false, danger: false, advice: "Market not open. Wait for 9:30 AM EST open." },
    { start: 9*60+30,    end: 9*60+45,  name: "Opening Bell (9:30–9:45)", optimal: false, caution: false, danger: true,  advice: "Extreme opening volatility. Algorithms battling. SKIP this window — wait for 9:45." },
    { start: 9*60+45,    end: 10*60+30, name: "Prime Window 1 (9:45–10:30)", optimal: true,  caution: false, danger: false, advice: "Best 0DTE window. First trend of the day establishes. Enter on 5-min bar close with all TFs aligned." },
    { start: 10*60+30,   end: 11*60+30, name: "Morning Continuation (10:30–11:30)", optimal: false, caution: false, danger: false, advice: "Good for trend continuation entries. Check if morning trend is intact vs EMA8 on 15-min." },
    { start: 11*60+30,   end: 12*60,    name: "Pre-Lunch Chop (11:30–12:00)", optimal: false, caution: true,  danger: false, advice: "Institutions stepping back. Volume drops. Avoid new 0DTE positions unless very strong signal." },
    { start: 12*60,      end: 13*60+30, name: "Lunch Hours (12:00–1:30 PM)", optimal: false, caution: false, danger: true,  advice: "Lowest volume of day. Choppy, whipsaw-prone. Do NOT trade 0DTE here — theta burning fast." },
    { start: 13*60+30,   end: 14*60+30, name: "Afternoon Reactivation (1:30–2:30)", optimal: false, caution: false, danger: false, advice: "Volume returns. Trend often resumes or reverses. Good for fresh signals if MTF re-aligns." },
    { start: 14*60+30,   end: 15*60,    name: "Prime Window 2 (2:30–3:00)", optimal: true,  caution: false, danger: false, advice: "Second best 0DTE window. Strong directional moves with 1 hour left. High gamma, large moves possible." },
    { start: 15*60,      end: 15*60+30, name: "Final Hour (3:00–3:30)", optimal: false, caution: true,  danger: false, advice: "Last push trades only. Only enter with extreme conviction and full MTF alignment. 30% stop is tight here." },
    { start: 15*60+30,   end: 15*60+45, name: "Danger Zone (3:30–3:45)", optimal: false, caution: false, danger: true,  advice: "Market on close orders hitting. Violent swings. 0DTE options at max gamma. EXIT existing positions." },
    { start: 15*60+45,   end: 16*60,    name: "EOD (3:45–4:00 PM)", optimal: false, caution: false, danger: true,  advice: "0DTE options expiring in minutes. Do NOT enter. Close all 0DTE before 3:50 PM to avoid assignment risk." },
    { start: 16*60,      end: 20*60,    name: "After Hours",          optimal: false, caution: false, danger: false, advice: "Market closed. Review today's trade and prepare for tomorrow's session." },
    { start: 20*60,      end: 24*60,    name: "Night",                optimal: false, caution: false, danger: false, advice: "Market closed." },
  ];

  for (const w of windows) {
    if (minutes >= w.start && minutes < w.end) {
      const minutesLeft = w.end - minutes;
      return {
        name: w.name,
        isOptimal: w.optimal,
        isCaution: w.caution,
        isDanger: w.danger,
        minutesLeft,
        advice: w.advice,
      };
    }
  }

  return {
    name: "Overnight",
    isOptimal: false,
    isCaution: false,
    isDanger: false,
    minutesLeft: null,
    advice: "Market closed. Plan tomorrow's session.",
  };
}

// ─── Expected move (for remaining session) ────────────────────────────────────

function getExpectedMove(atr5m: number): number {
  // SPY has ~78 five-minute bars per trading day
  // 1-sigma daily range ≈ 5m ATR × sqrt(78)
  return Math.round(atr5m * Math.sqrt(78) * 100) / 100;
}

// ─── 0DTE trading advice generator ───────────────────────────────────────────

function buildTradingAdvice(
  snap5m: TimeframeSnapshot,
  snap15m: TimeframeSnapshot,
  snap1h: TimeframeSnapshot,
  alignScore: number,
  entryWindow: EntryWindow,
  volumeCtx: VolumeContext,
  levels: SessionLevels,
  pivots: PivotLevels,
  currentPrice: number,
): string[] {
  const advice: string[] = [];

  // 1. MTF alignment
  if (alignScore === 3) {
    advice.push("All 3 timeframes aligned — maximum conviction. This is the highest-quality 0DTE setup. Size normally.");
  } else if (alignScore === -3) {
    advice.push("All 3 timeframes aligned bearish — maximum conviction for PUTs. Size normally.");
  } else if (Math.abs(alignScore) === 2) {
    const odd = alignScore > 0 ? "15m or 1h is still bearish" : "15m or 1h is still bullish";
    advice.push(`Two of three timeframes agree (${odd} — use smaller size (0.5×) until all align).`);
  } else {
    advice.push("Timeframes conflicted — no high-conviction 0DTE trade right now. Wait for MTF alignment before entering.");
  }

  // 2. Entry window
  if (entryWindow.isOptimal) {
    advice.push(`You are in the ${entryWindow.name} — the best entry window of the day. Time is on your side.`);
  } else if (entryWindow.isDanger) {
    advice.push(`DANGER: ${entryWindow.name}. ${entryWindow.advice}`);
  } else if (entryWindow.isCaution) {
    advice.push(`CAUTION: ${entryWindow.name}. Reduce position size by 50%.`);
  }

  // 3. Volume confirmation
  if (volumeCtx.expanding && Math.abs(alignScore) >= 2) {
    advice.push(`Volume is ${volumeCtx.relative}× average — institutional participation confirms the move. High-quality entry.`);
  } else if (!volumeCtx.expanding) {
    advice.push(`Volume is light (${volumeCtx.relative}× avg). Low-volume moves are prone to reversal — tighten stop or skip.`);
  }

  // 4. Key level proximity
  if (pivots.resistance.length > 0) {
    const nearestRes = pivots.resistance[0];
    const distPct = ((nearestRes - currentPrice) / currentPrice) * 100;
    if (distPct < 0.15) {
      advice.push(`Resistance at $${nearestRes} is very close (${distPct.toFixed(2)}% away). CALLs risky here — wait for a clean break above before entering.`);
    }
  }
  if (pivots.support.length > 0) {
    const nearestSup = pivots.support[0];
    const distPct = ((currentPrice - nearestSup) / currentPrice) * 100;
    if (distPct < 0.15) {
      advice.push(`Support at $${nearestSup} is very close (${distPct.toFixed(2)}% away). PUTs risky here — wait for a clean break below before entering.`);
    }
  }

  // 5. Distance to session levels
  const highDistPct = (levels.distToHigh / currentPrice) * 100;
  const lowDistPct  = (levels.distToLow  / currentPrice) * 100;
  if (highDistPct < 0.12) {
    advice.push(`Price is ${highDistPct.toFixed(2)}% from today's session HIGH ($${levels.sessionHigh}). Mean-reversion risk for longs — reduce CALL exposure.`);
  }
  if (lowDistPct < 0.12) {
    advice.push(`Price is ${lowDistPct.toFixed(2)}% from today's session LOW ($${levels.sessionLow}). Bounce risk for shorts — reduce PUT exposure.`);
  }

  // 6. RSI divergence across timeframes
  if (snap1h.rsi > 65 && snap5m.trend === "bullish") {
    advice.push(`1-hour RSI is elevated (${snap1h.rsi}) while 5-min still looks bullish — overbought risk on higher timeframe. Manage targets aggressively on CALLs.`);
  }
  if (snap1h.rsi < 35 && snap5m.trend === "bearish") {
    advice.push(`1-hour RSI is oversold (${snap1h.rsi}) while 5-min still falling — bounce risk on higher timeframe. Take profits on PUTs at T1.`);
  }

  // 7. MACD momentum across TFs
  if (snap5m.macdSlope === "up" && snap15m.macdSlope === "up" && snap1h.macdSlope === "up") {
    advice.push("MACD histogram expanding across all 3 timeframes — momentum is accelerating bullish. Strong CALL environment.");
  } else if (snap5m.macdSlope === "down" && snap15m.macdSlope === "down" && snap1h.macdSlope === "down") {
    advice.push("MACD histogram contracting/negative across all 3 timeframes — momentum is accelerating bearish. Strong PUT environment.");
  }

  // Always cap at 6 advice points to keep it readable
  return advice.slice(0, 6);
}

// ─── Main computation ─────────────────────────────────────────────────────────

export async function computeMtfAnalysis(): Promise<MtfAnalysis> {
  // Fetch all 3 timeframes in parallel
  const [bars5m, bars15m, bars1h] = await Promise.all([
    fetchBars("5m",  7),
    fetchBars("15m", 7),
    fetchBars("1h",  60),
  ]);

  const snap5m  = scoreBars(bars5m,  "5m");
  const snap15m = scoreBars(bars15m, "15m");
  const snap1h  = scoreBars(bars1h,  "1h");

  const currentPrice = bars5m[bars5m.length - 1].close;
  const marketStatus = getMarketStatus();

  // MTF alignment: each TF gets +1 (bullish) / -1 (bearish) / 0 (neutral)
  const vote = (s: TimeframeSnapshot) => s.trend === "bullish" ? 1 : s.trend === "bearish" ? -1 : 0;
  const alignScore = vote(snap5m) + vote(snap15m) + vote(snap1h);
  const alignDir: "bullish" | "mixed" | "bearish" =
    alignScore >= 2 ? "bullish" : alignScore <= -2 ? "bearish" : "mixed";

  const alignLabel =
    alignScore === 3  ? "All 3 TFs Bullish — Maximum Conviction" :
    alignScore === 2  ? "2 of 3 TFs Bullish — High Conviction" :
    alignScore === 1  ? "Mild Bullish Lean — Wait for Full Alignment" :
    alignScore === -1 ? "Mild Bearish Lean — Wait for Full Alignment" :
    alignScore === -2 ? "2 of 3 TFs Bearish — High Conviction" :
    alignScore === -3 ? "All 3 TFs Bearish — Maximum Conviction" :
    "Neutral / Conflicted — No Clear Edge";

  const alignConfidence = Math.round(40 + Math.abs(alignScore) * 18);

  // 0DTE components
  const entryWindow  = getEntryWindow();
  const sessionLevels = getSessionLevels(bars5m, currentPrice);
  const pivots       = detectPivots(bars15m, currentPrice);
  const volumeCtx    = getVolumeContext(bars5m);

  // Momentum acceleration: compare score of 5m snapshot now vs last n bars
  const previousBars5m = bars5m.slice(0, -3);
  const prevScore = previousBars5m.length >= 30 ? scoreBars(previousBars5m, "5m").score : snap5m.score;
  const scoreDelta = snap5m.score - prevScore;
  const momentumAcceleration: "accelerating" | "steady" | "fading" =
    Math.abs(scoreDelta) < 8 ? "steady" :
    (snap5m.score > 0 && scoreDelta > 0) || (snap5m.score < 0 && scoreDelta < 0) ? "accelerating" : "fading";

  // VIX proxy = annualized vol % from 5m ATR (no overnight gaps distortion)
  // 5m bars/year = 252 * 6.5 * 12 = 19,656 → sqrt ≈ 140
  const vixProxy = Math.round((snap5m.atr / currentPrice) * 140 * 100 * 100) / 100;

  // Entry quality synthesis
  let entryQuality: "High" | "Medium" | "Low" | "Avoid";
  let riskRating: "Low" | "Medium" | "High" | "Extreme";
  let suggestedSide: "CALL" | "PUT" | "WAIT";

  if (entryWindow.isDanger) {
    entryQuality = "Avoid";
    riskRating = "Extreme";
    suggestedSide = "WAIT";
  } else if (Math.abs(alignScore) === 3 && entryWindow.isOptimal && volumeCtx.expanding) {
    entryQuality = "High";
    riskRating = "Low";
    suggestedSide = alignScore > 0 ? "CALL" : "PUT";
  } else if (Math.abs(alignScore) >= 2 && !entryWindow.isCaution && !entryWindow.isDanger) {
    entryQuality = "Medium";
    riskRating = "Medium";
    suggestedSide = alignScore > 0 ? "CALL" : "PUT";
  } else if (Math.abs(alignScore) <= 1 || entryWindow.isCaution) {
    entryQuality = "Low";
    riskRating = "High";
    suggestedSide = "WAIT";
  } else {
    entryQuality = "Low";
    riskRating = "High";
    suggestedSide = "WAIT";
  }

  const tradingAdvice = buildTradingAdvice(
    snap5m, snap15m, snap1h,
    alignScore, entryWindow, volumeCtx, sessionLevels, pivots, currentPrice,
  );

  return {
    timestamp: new Date().toISOString(),
    marketStatus,
    currentPrice: Math.round(currentPrice * 100) / 100,
    timeframes: {
      "5m":  snap5m,
      "15m": snap15m,
      "1h":  snap1h,
    },
    alignment: {
      score: alignScore,
      direction: alignDir,
      label: alignLabel,
      confidence: alignConfidence,
    },
    zeroDTE: {
      entryQuality,
      suggestedSide,
      riskRating,
      entryWindow,
      sessionLevels,
      pivots,
      volumeContext: volumeCtx,
      momentumAcceleration,
      vixProxy,
      expectedMove: getExpectedMove(snap5m.atr),
      tradingAdvice,
    },
  };
}
