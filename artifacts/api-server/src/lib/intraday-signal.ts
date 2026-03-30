import YahooFinanceClass from "yahoo-finance2";
import {
  computeAtr,
  computeMomentumScore,
  computeRsi,
  OhlcvBar,
} from "./spy-data.js";
import {
  getMarketStatus,
  secondsUntilNextFiveMinBar,
  getNextSpyExpiry,
  daysUntil,
  tradingDaysUntil,
} from "./market-utils.js";

const yahooFinance = new YahooFinanceClass();

// ─── Constants ────────────────────────────────────────────────────────────────
const MAX_SCALP_PREMIUM = 2.50;   // Hard cap: never pay more than $2.50 for a 0DTE scalp
const MAX_OTM_STRIKES   = 3;      // Don't go more than 3 strikes OTM
const RSI_OVERSOLD_HARD  = 22;    // Below this → BLOCK bearish signals entirely
const RSI_OVERSOLD_WARN  = 30;    // Below this → downgrade confidence, flag risk
const RSI_OVERBOUGHT_HARD = 78;   // Above this → BLOCK bullish signals entirely
const RSI_OVERBOUGHT_WARN = 70;   // Above this → downgrade confidence, flag risk

// ─── 5-min bar fetch ──────────────────────────────────────────────────────────
async function fetch5mBars(): Promise<OhlcvBar[]> {
  const period1 = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const result = await yahooFinance.chart("SPY", {
    period1,
    interval: "5m" as any,
  });
  if (!result.quotes?.length) throw new Error("No 5m data from Yahoo Finance");
  return result.quotes
    .filter(q => q.open != null && q.close != null)
    .map(q => ({
      date: q.date instanceof Date ? q.date.toISOString() : String(q.date),
      open:   q.open   ?? 0,
      high:   q.high   ?? 0,
      low:    q.low    ?? 0,
      close:  q.close  ?? 0,
      volume: q.volume ?? 0,
    }));
}

// ─── RSI Regime Detection ────────────────────────────────────────────────────
/**
 * Computes RSI on 5-min bars and classifies the current regime.
 * Uses last 14 bars for RSI (standard), and also checks RSI trend (rising vs falling).
 */
function computeRsiRegime(bars: OhlcvBar[]): {
  rsi: number;
  rsiPrev: number;
  rising: boolean;
  regime: "deeply_oversold" | "oversold" | "neutral" | "overbought" | "deeply_overbought";
  blockBearish: boolean;
  blockBullish: boolean;
  warning: string | null;
} {
  const closes = bars.map(b => b.close);
  const rsi     = computeRsi(closes, 14);
  const rsiPrev = computeRsi(closes.slice(0, -1), 14);
  const rising  = rsi > rsiPrev;

  let regime: "deeply_oversold" | "oversold" | "neutral" | "overbought" | "deeply_overbought";
  let blockBearish = false;
  let blockBullish = false;
  let warning: string | null = null;

  if (rsi <= RSI_OVERSOLD_HARD) {
    regime       = "deeply_oversold";
    blockBearish = true;
    warning = `RSI ${rsi.toFixed(1)} — EXTREME OVERSOLD. Bounce risk is very high. PUT signal BLOCKED. Wait for RSI to recover above ${RSI_OVERSOLD_WARN} before re-entering bearish.`;
  } else if (rsi <= RSI_OVERSOLD_WARN) {
    regime  = "oversold";
    warning = `RSI ${rsi.toFixed(1)} — Oversold territory. Chasing PUTs here is high-risk. Confidence downgraded. Wait for RSI > ${RSI_OVERSOLD_WARN} or a CALL reversal setup.`;
  } else if (rsi >= RSI_OVERBOUGHT_HARD) {
    regime       = "deeply_overbought";
    blockBullish = true;
    warning = `RSI ${rsi.toFixed(1)} — EXTREME OVERBOUGHT. Pullback risk is very high. CALL signal BLOCKED. Wait for RSI to cool below ${RSI_OVERBOUGHT_WARN} before re-entering bullish.`;
  } else if (rsi >= RSI_OVERBOUGHT_WARN) {
    regime  = "overbought";
    warning = `RSI ${rsi.toFixed(1)} — Overbought territory. Chasing CALLs here is high-risk. Confidence downgraded.`;
  } else {
    regime = "neutral";
  }

  return { rsi, rsiPrev, rising, regime, blockBearish, blockBullish, warning };
}

// ─── Extended Move Detection ──────────────────────────────────────────────────
/**
 * Checks if we are on Day 2+ of a sustained directional move.
 * Uses the last ~78 bars (one full trading session = 6.5hrs * 12 bars/hr).
 * Returns how many consecutive bearish/bullish sessions detected.
 */
function detectExtendedMove(bars: OhlcvBar[]): {
  sessionsSinceTrend: number;
  trendDirection: "bearish" | "bullish" | "mixed";
  totalMovePercent: number;
} {
  // Approximate session boundaries (78 bars per day at 5-min)
  const barsPerSession = 78;
  const sessions = Math.floor(bars.length / barsPerSession);
  if (sessions < 2) return { sessionsSinceTrend: 1, trendDirection: "mixed", totalMovePercent: 0 };

  const sessionResults: ("bearish" | "bullish")[] = [];
  for (let s = 0; s < Math.min(sessions, 3); s++) {
    const start = bars.length - (s + 1) * barsPerSession;
    const end   = bars.length - s * barsPerSession;
    const slice = bars.slice(Math.max(start, 0), end);
    const open  = slice[0]?.open ?? 0;
    const close = slice[slice.length - 1]?.close ?? 0;
    sessionResults.unshift(close < open ? "bearish" : "bullish");
  }

  // Count consecutive sessions in same direction (most recent first, reversed)
  const reversed = [...sessionResults].reverse();
  const mostRecent = reversed[0];
  let count = 0;
  for (const result of reversed) {
    if (result === mostRecent) count++;
    else break;
  }

  const firstClose = bars[bars.length - barsPerSession * Math.min(sessions, 3)]?.close ?? bars[0].close;
  const lastClose  = bars[bars.length - 1].close;
  const totalMovePercent = ((lastClose - firstClose) / firstClose) * 100;

  return {
    sessionsSinceTrend: count,
    trendDirection: mostRecent,
    totalMovePercent: Math.round(totalMovePercent * 100) / 100,
  };
}

// ─── Premium estimation fallback ─────────────────────────────────────────────
function estimateIntradayPremium(
  currentPrice: number,
  strike: number,
  isCall: boolean,
  dte: number,
): number {
  const iv = 0.20;
  const t  = Math.max(dte, 0.5) / 365;
  const intrinsic  = isCall
    ? Math.max(0, currentPrice - strike)
    : Math.max(0, strike - currentPrice);
  const timeValue = currentPrice * iv * Math.sqrt(t) * 0.35;
  return Math.max(intrinsic + timeValue, 0.10);
}

// ─── Option contract type ─────────────────────────────────────────────────────
type OptionContract = {
  strike:           number;
  expiration:       string;
  daysToExpiry:     number;
  premiumEntry:     number;
  impliedVolatility: number | null;
  delta:            number | null;
  openInterest:     number | null;
  volume:           number | null;
};

// ─── Tradier fetcher — now accepts specific target strike ─────────────────────
async function fetchOptionViaTradier(
  currentPrice: number,
  side: "CALL" | "PUT",
  expiry: Date,
  dte: number,
  targetStrike?: number,  // NEW: specific strike override
): Promise<OptionContract | null> {
  const TRADIER_TOKEN = process.env.TRADIER_API_KEY;
  if (!TRADIER_TOKEN) return null;

  const expiryStr = expiry.toISOString().split("T")[0];
  const url = `https://api.tradier.com/v1/markets/options/chains?symbol=SPY&expiration=${expiryStr}&greeks=true`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${TRADIER_TOKEN}`, Accept: "application/json" },
  });
  if (!res.ok) return null;

  const json    = await res.json();
  const options: any[] = json?.options?.option ?? [];
  if (!options.length) return null;

  const isCall      = side === "CALL";
  const sideOptions = options.filter((o: any) => o.option_type === (isCall ? "call" : "put"));
  const strike      = targetStrike ?? Math.round(currentPrice);

  const sorted = [...sideOptions].sort(
    (a: any, b: any) => Math.abs(a.strike - strike) - Math.abs(b.strike - strike),
  );

  for (const opt of sorted.slice(0, 3)) {
    const bid: number = opt.bid ?? 0;
    const ask: number = opt.ask ?? 0;
    const mid  = bid > 0 && ask > 0 ? (bid + ask) / 2 : 0;
    const last: number = opt.last ?? 0;
    const iv: number | null = opt.greeks?.mid_iv ?? opt.greeks?.ask_iv ?? null;
    const premiumEntry = mid > 0 ? mid : last > 0 ? last
      : estimateIntradayPremium(currentPrice, opt.strike, isCall, dte);

    return {
      strike:            opt.strike,
      expiration:        expiryStr,
      daysToExpiry:      dte,
      premiumEntry:      Math.round(premiumEntry * 100) / 100,
      impliedVolatility: iv != null ? Math.round(iv * 10000) / 100 : null,
      delta:             opt.greeks?.delta != null ? Math.round(opt.greeks.delta * 1000) / 1000 : null,
      openInterest:      opt.open_interest ?? null,
      volume:            opt.volume ?? null,
    };
  }
  return null;
}

// ─── Yahoo Finance fallback fetcher ───────────────────────────────────────────
async function fetchOptionViaYahoo(
  currentPrice: number,
  side: "CALL" | "PUT",
  expiry: Date,
  dte: number,
  targetStrike?: number,
): Promise<OptionContract | null> {
  try {
    const isCall     = side === "CALL";
    const strike     = targetStrike ?? Math.round(currentPrice);
    const optionsData = await yahooFinance.options("SPY");
    if (!optionsData?.options?.length) return null;

    const chain     = optionsData.options[0];
    const contracts = isCall ? chain.calls : chain.puts;
    if (!contracts?.length) return null;

    const sorted = [...contracts].sort(
      (a, b) => Math.abs(a.strike - strike) - Math.abs(b.strike - strike),
    );

    for (const best of sorted.slice(0, 5)) {
      const bid  = best.bid  ?? 0;
      const ask  = best.ask  ?? 0;
      const mid  = bid > 0 && ask > 0 ? (bid + ask) / 2 : 0;
      const last = best.lastPrice ?? 0;
      if (mid === 0 && last === 0) continue;

      const premiumEntry = mid > 0 ? mid : last > 0 ? last
        : estimateIntradayPremium(currentPrice, best.strike, isCall, dte);

      return {
        strike:            best.strike,
        expiration:        expiry.toISOString().split("T")[0],
        daysToExpiry:      dte,
        premiumEntry:      Math.round(premiumEntry * 100) / 100,
        impliedVolatility: best.impliedVolatility != null && best.impliedVolatility > 0
          ? Math.round(best.impliedVolatility * 10000) / 100 : null,
        delta:             "delta" in best && (best as any).delta != null
          ? Math.round((best as any).delta * 1000) / 1000 : null,
        openInterest:      best.openInterest ?? null,
        volume:            best.volume       ?? null,
      };
    }
    return null;
  } catch {
    return null;
  }
}

// ─── Smart strike selector — caps premium, goes OTM if ATM too expensive ─────
/**
 * Tries ATM first. If premium > MAX_SCALP_PREMIUM, walks OTM by $1 increments
 * until premium fits or we hit MAX_OTM_STRIKES. Returns cheapest viable contract.
 */
async function findBestScalpStrike(
  currentPrice: number,
  side: "CALL" | "PUT",
  expiry: Date,
  dte: number,
): Promise<OptionContract | null> {
  const isCall    = side === "CALL";
  const atmStrike = Math.round(currentPrice);

  for (let otmOffset = 0; otmOffset <= MAX_OTM_STRIKES; otmOffset++) {
    // CALL OTM = higher strike, PUT OTM = lower strike
    const targetStrike = isCall
      ? atmStrike + otmOffset
      : atmStrike - otmOffset;

    // Try Tradier first, Yahoo fallback
    const contract =
      (await fetchOptionViaTradier(currentPrice, side, expiry, dte, targetStrike)) ??
      (await fetchOptionViaYahoo(currentPrice, side, expiry, dte, targetStrike));

    if (!contract) continue;

    // Accept if premium is within cap
    if (contract.premiumEntry <= MAX_SCALP_PREMIUM) return contract;

    // At ATM we're already over cap — skip directly to OTM
    if (otmOffset === 0) continue;
  }

  // Fallback: return whatever ATM gives even if over cap (better than null)
  return (
    (await fetchOptionViaTradier(currentPrice, side, expiry, dte)) ??
    (await fetchOptionViaYahoo(currentPrice, side, expiry, dte))
  );
}

// ─── ATR-based realistic premium targets ─────────────────────────────────────
/**
 * Computes T1/T2/Stop based on expected SPY move (ATR) and estimated delta.
 * This ties option targets to real price movement, not arbitrary % of premium.
 */
function computeRealisticTargets(
  premiumEntry: number,
  atr5m: number,
  delta: number | null,
  dte: number,
): { premiumStop: number; premiumT1: number; premiumT2: number } {
  const round2 = (n: number) => Math.round(n * 100) / 100;

  // Estimated delta — use actual if available, otherwise assume by moneyness
  const effectiveDelta = Math.abs(delta ?? 0.40);

  // Expected SPY move for T1 and T2 (ATR multiples)
  const spyMoveT1 = atr5m * 1.2;   // 1.2x ATR → realistic first target
  const spyMoveT2 = atr5m * 2.2;   // 2.2x ATR → full run target

  // Option premium gain = SPY move × delta (Black-Scholes delta approximation)
  // Apply a theta drag factor for 0DTE (time decay is severe)
  const thetaDrag = dte === 0 ? 0.75 : 0.88;  // 0DTE options lose value faster
  const premiumGainT1 = spyMoveT1 * effectiveDelta * thetaDrag;
  const premiumGainT2 = spyMoveT2 * effectiveDelta * thetaDrag;

  const premiumT1 = round2(Math.max(premiumEntry + premiumGainT1, premiumEntry * 1.30));
  const premiumT2 = round2(Math.max(premiumEntry + premiumGainT2, premiumEntry * 1.65));

  // Stop: -30% of entry (unchanged — this is already reasonable)
  const premiumStop = round2(premiumEntry * 0.70);

  return { premiumStop, premiumT1, premiumT2 };
}

// ─── Interfaces ───────────────────────────────────────────────────────────────
export interface TradingTradeSetup {
  side:              "CALL" | "PUT";
  strike:            number;
  expiration:        string;
  daysToExpiry:      number;
  premiumEntry:      number;
  premiumStop:       number;
  premiumT1:         number;
  premiumT2:         number;
  underlyingEntry:   number;
  underlyingStop:    number;
  underlyingT1:      number;
  underlyingT2:      number;
  impliedVolatility: number | null;
  delta:             number | null;
  openInterest:      number | null;
  volume:            number | null;
}

export interface TradingSignal {
  mode:         "intraday" | "swing";
  signal:       "CALL" | "PUT" | "WAIT";
  confidence:   number;
  score:        number;
  reasoning:    string;
  keyFactors:   string[];
  currentPrice: number;
  timestamp:    string;
  marketStatus: "open" | "premarket" | "afterhours" | "closed";
  nextBarIn:    number | null;
  targetDate:   string | null;
  bars:         OhlcvBar[];
  trade:        TradingTradeSetup | null;
  // NEW fields
  rsi:              number;
  rsiRegime:        string;
  rsiWarning:       string | null;
  extendedMove:     { sessionsSinceTrend: number; trendDirection: string; totalMovePercent: number } | null;
}

// ─── Main signal engine ───────────────────────────────────────────────────────
export async function computeIntradaySignal(): Promise<TradingSignal> {
  const bars = await fetch5mBars();
  if (bars.length < 30) throw new Error("Insufficient 5m data");

  const currentPrice = bars[bars.length - 1].close;
  const atr5m        = computeAtr(bars, 14);
  const marketStatus = getMarketStatus();

  // ── Step 1: Momentum score (existing engine)
  const { score, factors } = computeMomentumScore(bars);
  const keyFactors = factors
    .sort((a, b) => Math.abs(b.score) - Math.abs(a.score))
    .map(f => f.detail);

  // ── Step 2: RSI regime check (NEW)
  const rsiRegimeData = computeRsiRegime(bars);

  // ── Step 3: Extended move detection (NEW)
  const extendedMove = detectExtendedMove(bars);

  // ── Step 4: Signal determination with RSI guard
  let signal: "CALL" | "PUT" | "WAIT";
  let confidence: number;
  let reasoning: string;

  // Determine raw signal from momentum score
  let rawSignal: "CALL" | "PUT" | "WAIT";
  if      (score >= 30)  rawSignal = "CALL";
  else if (score <= -30) rawSignal = "PUT";
  else if (score >= 15)  rawSignal = "CALL";
  else if (score <= -15) rawSignal = "PUT";
  else                   rawSignal = "WAIT";

  // ── RSI Guard: block signals in extreme conditions
  if (rawSignal === "PUT" && rsiRegimeData.blockBearish) {
    // RSI is deeply oversold — block PUT, suggest CALL reversal watch
    signal     = "WAIT";
    confidence = 25;
    reasoning  = `⛔ PUT signal BLOCKED — ${rsiRegimeData.warning} ` +
      `Momentum score is ${score} (bearish), but RSI ${rsiRegimeData.rsi.toFixed(1)} signals extreme exhaustion. ` +
      `Watch for a bullish reversal candle (5-min green close above EMA8) before considering a CALL scalp.`;
  } else if (rawSignal === "CALL" && rsiRegimeData.blockBullish) {
    signal     = "WAIT";
    confidence = 25;
    reasoning  = `⛔ CALL signal BLOCKED — ${rsiRegimeData.warning} ` +
      `Momentum score is +${score} (bullish), but RSI ${rsiRegimeData.rsi.toFixed(1)} signals extreme exhaustion. ` +
      `Wait for RSI to cool before entering.`;
  } else if (score >= 30) {
    signal     = "CALL";
    confidence = Math.min(50 + score * 0.6, 92);
    reasoning  = `5-min momentum strongly bullish (score: +${score}). EMA8/21 crossover and MACD confirm upward pressure.`;
    // Downgrade if oversold warning (CALL in oversold = reversal trade, lower confidence)
    if (rsiRegimeData.regime === "oversold") {
      confidence = Math.max(confidence - 15, 35);
      reasoning += ` ⚠️ RSI ${rsiRegimeData.rsi.toFixed(1)} — oversold bounce possible but risky, use half size.`;
    }
    // Downgrade if extended move in same direction
    if (extendedMove.trendDirection === "bullish" && extendedMove.sessionsSinceTrend >= 2) {
      confidence = Math.max(confidence - 10, 35);
      reasoning += ` ⚠️ Day ${extendedMove.sessionsSinceTrend} of bullish move — continuation risk elevated.`;
    }
  } else if (score <= -30 && rsi > 25) {
    signal     = "PUT";
    confidence = Math.min(50 + Math.abs(score) * 0.6, 92);
    reasoning  = `5-min momentum strongly bearish (score: ${score}). EMA8/21 crossover and MACD confirm downward pressure.`;
    // Downgrade if extended move already in bearish direction
    if (extendedMove.trendDirection === "bearish" && extendedMove.sessionsSinceTrend >= 2) {
      confidence = Math.max(confidence - 12, 35);
      reasoning += ` ⚠️ Day ${extendedMove.sessionsSinceTrend} of sell-off (${extendedMove.totalMovePercent.toFixed(1)}% total). ` +
        `Chasing PUTs on Day ${extendedMove.sessionsSinceTrend} is high-risk — reversal bounce imminent.`;
    }
    if (rsiRegimeData.regime === "oversold") {
      confidence = Math.max(confidence - 15, 30);
      reasoning += ` ⚠️ ${rsiRegimeData.warning}`;
    }
  } else if (score >= 15) {
    signal     = "CALL";
    confidence = 38 + score * 0.5;
    reasoning  = `Mild bullish lean (score: +${score}). Not high conviction — wait for breakout candle or use smaller size.`;
  } else if (score <= -15) {
    signal     = "PUT";
    confidence = 38 + Math.abs(score) * 0.5;
    reasoning  = `Mild bearish lean (score: ${score}). Not high conviction — wait for breakdown candle or use smaller size.`;
    if (rsiRegimeData.regime === "oversold") {
      confidence = Math.max(confidence - 12, 28);
      reasoning += ` ⚠️ ${rsiRegimeData.warning}`;
    }
  } else {
    signal     = "WAIT";
    confidence = 30 + Math.abs(score);
    reasoning  = `No clear edge on 5-min (score: ${score}). Price is ranging. Do NOT trade in chop — wait for decisive 5-min bar close above/below EMA21.`;
  }

  confidence = Math.round(Math.min(Math.max(confidence, 22), 92));

  const commonFields = {
    mode: "intraday" as const,
    signal,
    confidence,
    score,
    reasoning,
    keyFactors,
    currentPrice,
    timestamp:     new Date().toISOString(),
    marketStatus,
    nextBarIn:     secondsUntilNextFiveMinBar(),
    targetDate:    null,
    bars:          bars.slice(-60),
    rsi:           Math.round(rsiRegimeData.rsi * 10) / 10,
    rsiRegime:     rsiRegimeData.regime,
    rsiWarning:    rsiRegimeData.warning,
    extendedMove,
  };

  // Cap: if market closed and premium over limit, force WAIT
  if (signal !== "WAIT" && marketStatus !== "open" && marketStatus !== "premarket") {
    signal = "WAIT";
    reasoning = `Market closed — no 0DTE options available. Next session opens with fresher premiums. Current signal bias: ${rawSignal ?? signal} (score: ${score}).`;
  }

  if (signal === "WAIT") {
    return { ...commonFields, trade: null };
  }

  // ── Step 5: Find best strike (premium-capped, OTM if needed)
  const side   = signal as "CALL" | "PUT";
  const isCall = side === "CALL";
  const expiry = getNextSpyExpiry(0);
  const dte    = Math.max(tradingDaysUntil(expiry), 0);

  let contract = await findBestScalpStrike(currentPrice, side, expiry, dte);

  // Hard fallback to estimated values if all data sources fail
  if (!contract) {
    const strike       = Math.round(currentPrice);
    const premiumEntry = estimateIntradayPremium(currentPrice, strike, isCall, dte);
    contract = {
      strike,
      expiration:        expiry.toISOString().split("T")[0],
      daysToExpiry:      dte,
      premiumEntry:      Math.round(premiumEntry * 100) / 100,
      impliedVolatility: 20,
      delta:             isCall ? 0.50 : -0.50,
      openInterest:      null,
      volume:            null,
    };
  }

  // ── Step 6: Compute realistic targets (ATR + delta based)
  const round2 = (n: number) => Math.round(n * 100) / 100;
  const pe      = contract.premiumEntry;

  const { premiumStop, premiumT1, premiumT2 } = computeRealisticTargets(
    pe,
    atr5m,
    contract.delta,
    dte,
  );

  // Underlying SPY price levels (ATR-based, unchanged — these were already good)
  const underlyingEntry = round2(currentPrice);
  const underlyingStop  = round2(isCall ? currentPrice - atr5m * 1.5 : currentPrice + atr5m * 1.5);
  const underlyingT1    = round2(isCall ? currentPrice + atr5m * 1.2 : currentPrice - atr5m * 1.2);
  const underlyingT2    = round2(isCall ? currentPrice + atr5m * 2.2 : currentPrice - atr5m * 2.2);

  // Append premium info to reasoning
  const otmInfo = contract.strike !== Math.round(currentPrice)
    ? ` Selected ${isCall ? "OTM" : "OTM"} strike $${contract.strike} (${Math.abs(contract.strike - Math.round(currentPrice))} strike${Math.abs(contract.strike - Math.round(currentPrice)) > 1 ? "s" : ""} OTM) — premium capped at $${MAX_SCALP_PREMIUM} for scalp discipline.`
    : ` ATM strike $${contract.strike} — premium $${pe} is within scalp range.`;
  reasoning += otmInfo;

  return {
    ...commonFields,
    trade: {
      side,
      strike:            contract.strike,
      expiration:        contract.expiration,
      daysToExpiry:      contract.daysToExpiry,
      premiumEntry:      pe,
      premiumStop,
      premiumT1,
      premiumT2,
      underlyingEntry,
      underlyingStop,
      underlyingT1,
      underlyingT2,
      impliedVolatility: contract.impliedVolatility,
      delta:             contract.delta,
      openInterest:      contract.openInterest,
      volume:            contract.volume,
    },
  };
}
