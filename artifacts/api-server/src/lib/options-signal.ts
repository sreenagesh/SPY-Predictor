import YahooFinanceClass from "yahoo-finance2";
import {
  fetchSpyHistory,
  computeRsi,
  computeSma,
  computeMacd,
  computeBollingerBands,
  computeAtr,
  computeEma,
  computeMomentumScore,
  OhlcvBar,
} from "./spy-data.js";

const yahooFinance = new YahooFinanceClass();

interface OptionsContract {
  strike: number;
  expiration: string;
  daysToExpiry: number;
  premiumEntry: number;
  impliedVolatility: number | null;
  delta: number | null;
  openInterest: number | null;
  volume: number | null;
}

function getNextFridays(count = 4): Date[] {
  const now = new Date();
  const fridays: Date[] = [];
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  while (fridays.length < count) {
    d.setDate(d.getDate() + 1);
    if (d.getDay() === 5) fridays.push(new Date(d));
  }
  return fridays;
}

function daysUntil(date: Date): number {
  const now = new Date();
  return Math.ceil((date.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
}

function estimatePremium(currentPrice: number, strike: number, atr: number, daysToExpiry: number, isCall: boolean): number {
  const iv = 0.18;
  const t = daysToExpiry / 365;
  const intrinsic = isCall
    ? Math.max(0, currentPrice - strike)
    : Math.max(0, strike - currentPrice);
  const timeValue = currentPrice * iv * Math.sqrt(t) * 0.4;
  return Math.max(intrinsic + timeValue, 0.05);
}

async function fetchOptionsChain(
  currentPrice: number,
  side: "CALL" | "PUT",
  atr: number
): Promise<OptionsContract | null> {
  try {
    const fridays = getNextFridays(4);
    const targetExpiry = fridays.find(f => daysUntil(f) >= 7) ?? fridays[0];
    const dte = daysUntil(targetExpiry);

    const optionsData = await yahooFinance.options("SPY");
    if (!optionsData?.options?.length) return null;

    const chain = optionsData.options[0];
    const contracts = side === "CALL" ? chain.calls : chain.puts;
    if (!contracts?.length) return null;

    const targetStrike = side === "CALL"
      ? Math.ceil(currentPrice / 1) * 1
      : Math.floor(currentPrice / 1) * 1;

    const sorted = [...contracts].sort((a, b) =>
      Math.abs(a.strike - targetStrike) - Math.abs(b.strike - targetStrike)
    );

    const best = sorted[0];
    if (!best) return null;

    const ask = best.ask ?? best.lastPrice ?? estimatePremium(currentPrice, best.strike, atr, dte, side === "CALL");

    return {
      strike: best.strike,
      expiration: targetExpiry.toISOString().split("T")[0],
      daysToExpiry: dte,
      premiumEntry: Math.round(ask * 100) / 100,
      impliedVolatility: best.impliedVolatility != null ? Math.round(best.impliedVolatility * 10000) / 100 : null,
      delta: "delta" in best && best.delta != null ? Math.round((best as any).delta * 1000) / 1000 : null,
      openInterest: best.openInterest ?? null,
      volume: best.volume ?? null,
    };
  } catch {
    return null;
  }
}

export interface OptionsSignal {
  symbol: string;
  timestamp: string;
  currentPrice: number;
  signal: "CALL" | "PUT" | "WAIT";
  confidence: number;
  reasoning: string;
  keyFactors: string[];
  technicalScore: number;
  trade: {
    side: "CALL" | "PUT";
    strike: number;
    expiration: string;
    daysToExpiry: number;
    premiumEntry: number;
    premiumStop: number;
    premiumT1: number;
    premiumT2: number;
    underlyingEntry: number;
    underlyingStop: number;
    underlyingT1: number;
    underlyingT2: number;
    impliedVolatility: number | null;
    delta: number | null;
    openInterest: number | null;
    volume: number | null;
  } | null;
}

export async function computeOptionsSignal(): Promise<OptionsSignal> {
  const bars = await fetchSpyHistory("6mo");
  if (bars.length < 30) throw new Error("Insufficient data");

  const closes = bars.map(b => b.close);
  const currentPrice = closes[closes.length - 1];
  const atr = computeAtr(bars, 14);

  // ── Short-term momentum score (highest weight — reflects actual current trend)
  const { score: momentumScore, factors: momentumFactors } = computeMomentumScore(bars);

  const scores: { factor: string; score: number; reason: string }[] = [];

  // Add each momentum factor as an individual scored item
  for (const mf of momentumFactors) {
    scores.push({ factor: mf.label, score: mf.score, reason: mf.detail });
  }

  // ── SMA 20/50 alignment — medium-term context (weight: ±12, reduced from ±18)
  const sma20 = computeSma(closes, 20);
  const sma50 = computeSma(closes, 50);
  const aboveSma20 = currentPrice > sma20;
  const aboveSma50 = currentPrice > sma50;
  if (aboveSma20 && aboveSma50 && sma20 > sma50) {
    scores.push({ factor: "Trend", score: 12, reason: "Price above SMA20 & SMA50 with bullish alignment" });
  } else if (!aboveSma20 && !aboveSma50 && sma20 < sma50) {
    scores.push({ factor: "Trend", score: -12, reason: "Price below SMA20 & SMA50 with bearish alignment" });
  } else if (aboveSma20 && !aboveSma50) {
    scores.push({ factor: "Trend", score: 4, reason: "Price above SMA20 but below SMA50 — mixed medium-term" });
  } else {
    scores.push({ factor: "Trend", score: -4, reason: "Price below SMA20 but holding near SMA50 — weakening" });
  }

  // ── Bollinger Bands — mean-reversion context (weight: ±12)
  const bb = computeBollingerBands(closes, 20);
  if (bb.percentB < 0.1) {
    scores.push({ factor: "Bollinger Bands", score: 12, reason: `Price at lower BB extreme (${(bb.percentB * 100).toFixed(0)}%) — oversold reversal zone` });
  } else if (bb.percentB < 0.25) {
    scores.push({ factor: "Bollinger Bands", score: 6, reason: `Price near lower BB (${(bb.percentB * 100).toFixed(0)}%) — approaching oversold` });
  } else if (bb.percentB > 0.9) {
    scores.push({ factor: "Bollinger Bands", score: -12, reason: `Price at upper BB extreme (${(bb.percentB * 100).toFixed(0)}%) — overbought reversal zone` });
  } else if (bb.percentB > 0.75) {
    scores.push({ factor: "Bollinger Bands", score: -6, reason: `Price near upper BB (${(bb.percentB * 100).toFixed(0)}%) — overbought territory` });
  } else {
    scores.push({ factor: "Bollinger Bands", score: 0, reason: `Price mid-range in BB (${(bb.percentB * 100).toFixed(0)}%) — no extreme` });
  }

  // ── Golden/Death Cross — BACKGROUND context only (weight: ±5, reduced from ±15)
  // Long-term structure gives very little edge for intraday options direction
  const sma200 = computeSma(closes, Math.min(200, closes.length));
  if (sma50 > sma200) {
    scores.push({ factor: "Long-term", score: 5, reason: `Golden cross background — SMA50 $${sma50.toFixed(2)} > SMA200 $${sma200.toFixed(2)}` });
  } else {
    scores.push({ factor: "Long-term", score: -5, reason: `Death cross background — SMA50 $${sma50.toFixed(2)} < SMA200 $${sma200.toFixed(2)}` });
  }

  const technicalScore = scores.reduce((sum, s) => sum + s.score, 0);

  // Show only the most impactful factors in the UI (momentum factors first)
  const keyFactors = scores
    .sort((a, b) => Math.abs(b.score) - Math.abs(a.score))
    .slice(0, 6)
    .map(s => s.reason);

  let signal: "CALL" | "PUT" | "WAIT";
  let confidence: number;
  let reasoning: string;

  if (technicalScore >= 40) {
    signal = "CALL";
    confidence = Math.min(52 + technicalScore * 0.55, 92);
    reasoning = `Strong bullish confluence (score: +${technicalScore}). Short-term momentum, EMA trend, and MACD all aligned upward. CALL offers best risk-adjusted entry with defined premium risk.`;
  } else if (technicalScore <= -40) {
    signal = "PUT";
    confidence = Math.min(52 + Math.abs(technicalScore) * 0.55, 92);
    reasoning = `Strong bearish confluence (score: ${technicalScore}). Short-term momentum, EMA trend, and MACD all point lower. PUT offers best risk-adjusted entry with defined premium risk.`;
  } else if (technicalScore >= 20) {
    signal = "CALL";
    confidence = 38 + technicalScore * 0.5;
    reasoning = `Moderate bullish lean (score: +${technicalScore}). Short-term indicators favor upside but conviction is not high — consider reduced size or wait for breakout confirmation.`;
  } else if (technicalScore <= -20) {
    signal = "PUT";
    confidence = 38 + Math.abs(technicalScore) * 0.5;
    reasoning = `Moderate bearish lean (score: ${technicalScore}). Short-term indicators favor downside but conviction is not high — consider reduced size or wait for breakdown confirmation.`;
  } else {
    signal = "WAIT";
    confidence = 30 + Math.abs(technicalScore) * 1.5;
    reasoning = `No clear directional edge (score: ${technicalScore}). Short-term signals are conflicting — best to wait for the EMA 8/21 and MACD to resolve in one direction before opening options positions.`;
  }

  confidence = Math.round(Math.min(Math.max(confidence, 25), 92));

  if (signal === "WAIT") {
    return { symbol: "SPY", timestamp: new Date().toISOString(), currentPrice, signal, confidence, reasoning, keyFactors, technicalScore, trade: null };
  }

  const side = signal as "CALL" | "PUT";
  const isCall = side === "CALL";

  let contract = await fetchOptionsChain(currentPrice, side, atr);

  if (!contract) {
    const dte = 7;
    const strike = isCall ? Math.round(currentPrice) + 1 : Math.round(currentPrice) - 1;
    const premiumEntry = estimatePremium(currentPrice, strike, atr, dte, isCall);
    contract = {
      strike,
      expiration: getNextFridays(1)[0].toISOString().split("T")[0],
      daysToExpiry: dte,
      premiumEntry: Math.round(premiumEntry * 100) / 100,
      impliedVolatility: 18,
      delta: isCall ? 0.5 : -0.5,
      openInterest: null,
      volume: null,
    };
  }

  const round2 = (n: number) => Math.round(n * 100) / 100;
  const pe = contract.premiumEntry;

  const premiumStop = round2(pe * 0.45);
  const premiumT1 = round2(pe * 2.0);
  const premiumT2 = round2(pe * 3.5);

  const underlyingEntry = round2(currentPrice);
  const underlyingStop = round2(isCall ? currentPrice - atr * 0.35 : currentPrice + atr * 0.35);
  const underlyingT1 = round2(isCall ? currentPrice + atr * 0.45 : currentPrice - atr * 0.45);
  const underlyingT2 = round2(isCall ? currentPrice + atr * 0.9 : currentPrice - atr * 0.9);

  return {
    symbol: "SPY",
    timestamp: new Date().toISOString(),
    currentPrice,
    signal,
    confidence,
    reasoning,
    keyFactors,
    technicalScore,
    trade: {
      side,
      strike: contract.strike,
      expiration: contract.expiration,
      daysToExpiry: contract.daysToExpiry,
      premiumEntry: pe,
      premiumStop,
      premiumT1,
      premiumT2,
      underlyingEntry,
      underlyingStop,
      underlyingT1,
      underlyingT2,
      impliedVolatility: contract.impliedVolatility,
      delta: contract.delta,
      openInterest: contract.openInterest,
      volume: contract.volume,
    },
  };
}
