import YahooFinanceClass from "yahoo-finance2";
import { fetchSpyHistory, computeRsi, computeSma, computeMacd, computeBollingerBands, computeAtr, OhlcvBar } from "./spy-data.js";

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
  const iv = 0.18; // typical SPY IV ~18%
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
    // Target 7–14 DTE for ideal gamma/theta balance
    const targetExpiry = fridays.find(f => daysUntil(f) >= 7) ?? fridays[0];
    const dte = daysUntil(targetExpiry);

    const optionsData = await yahooFinance.options("SPY");
    if (!optionsData?.options?.length) return null;

    const chain = optionsData.options[0];
    const contracts = side === "CALL" ? chain.calls : chain.puts;
    if (!contracts?.length) return null;

    // Find ATM strike (closest to current price, slightly OTM preferred)
    const targetStrike = side === "CALL"
      ? Math.ceil(currentPrice / 1) * 1  // ATM or 1$ OTM
      : Math.floor(currentPrice / 1) * 1;

    const sorted = [...contracts].sort((a, b) =>
      Math.abs(a.strike - targetStrike) - Math.abs(b.strike - targetStrike)
    );

    const best = sorted[0];
    if (!best) return null;

    const expirationDate = new Date(best.contractSymbol?.slice(3, 9).replace(/(\d{2})(\d{2})(\d{2})/, "20$1-$2-$3") || targetExpiry.toISOString());

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

  const rsi = computeRsi(closes, 14);
  const sma20 = computeSma(closes, 20);
  const sma50 = computeSma(closes, 50);
  const sma200 = computeSma(closes, Math.min(200, closes.length));
  const macd = computeMacd(closes);
  const bb = computeBollingerBands(closes, 20);

  // Score each indicator: +20 bullish, -20 bearish, 0 neutral
  const scores: { factor: string; score: number; reason: string }[] = [];

  // RSI
  if (rsi < 32) scores.push({ factor: "RSI", score: 25, reason: `RSI oversold at ${rsi.toFixed(1)} — strong bounce candidate` });
  else if (rsi < 42) scores.push({ factor: "RSI", score: 12, reason: `RSI at ${rsi.toFixed(1)} — mild oversold, bullish lean` });
  else if (rsi > 72) scores.push({ factor: "RSI", score: -25, reason: `RSI overbought at ${rsi.toFixed(1)} — likely pullback ahead` });
  else if (rsi > 62) scores.push({ factor: "RSI", score: -12, reason: `RSI at ${rsi.toFixed(1)} — elevated, bearish lean` });
  else scores.push({ factor: "RSI", score: 0, reason: `RSI neutral at ${rsi.toFixed(1)}` });

  // MACD
  if (macd.histogram > 1.5) scores.push({ factor: "MACD", score: 22, reason: `MACD histogram strongly positive (+${macd.histogram.toFixed(2)}) — bullish momentum` });
  else if (macd.histogram > 0.3) scores.push({ factor: "MACD", score: 12, reason: `MACD histogram positive (+${macd.histogram.toFixed(2)}) — upward momentum` });
  else if (macd.histogram < -1.5) scores.push({ factor: "MACD", score: -22, reason: `MACD histogram strongly negative (${macd.histogram.toFixed(2)}) — bearish momentum` });
  else if (macd.histogram < -0.3) scores.push({ factor: "MACD", score: -12, reason: `MACD histogram negative (${macd.histogram.toFixed(2)}) — downward pressure` });
  else scores.push({ factor: "MACD", score: 0, reason: `MACD near zero (${macd.histogram.toFixed(2)}) — consolidating` });

  // SMA trend
  const aboveSma20 = currentPrice > sma20;
  const aboveSma50 = currentPrice > sma50;
  if (aboveSma20 && aboveSma50 && sma20 > sma50) scores.push({ factor: "Trend", score: 18, reason: "Price above SMA20 & SMA50 with bullish alignment" });
  else if (!aboveSma20 && !aboveSma50 && sma20 < sma50) scores.push({ factor: "Trend", score: -18, reason: "Price below SMA20 & SMA50 with bearish alignment" });
  else if (aboveSma20 && !aboveSma50) scores.push({ factor: "Trend", score: 5, reason: "Price above SMA20 but below SMA50 — mixed" });
  else scores.push({ factor: "Trend", score: -5, reason: "Price below SMA20 but holding near SMA50 — weakening" });

  // Golden/Death cross
  if (sma50 > sma200) scores.push({ factor: "Golden Cross", score: 15, reason: `Golden cross active — SMA50 $${sma50.toFixed(2)} > SMA200 $${sma200.toFixed(2)}` });
  else scores.push({ factor: "Death Cross", score: -15, reason: `Death cross active — SMA50 $${sma50.toFixed(2)} < SMA200 $${sma200.toFixed(2)}` });

  // Bollinger Bands
  if (bb.percentB < 0.1) scores.push({ factor: "Bollinger Bands", score: 20, reason: `Price at lower BB extreme (${(bb.percentB * 100).toFixed(0)}%) — reversal zone` });
  else if (bb.percentB < 0.25) scores.push({ factor: "Bollinger Bands", score: 10, reason: `Price near lower BB (${(bb.percentB * 100).toFixed(0)}%) — oversold zone` });
  else if (bb.percentB > 0.9) scores.push({ factor: "Bollinger Bands", score: -20, reason: `Price at upper BB extreme (${(bb.percentB * 100).toFixed(0)}%) — reversal zone` });
  else if (bb.percentB > 0.75) scores.push({ factor: "Bollinger Bands", score: -10, reason: `Price near upper BB (${(bb.percentB * 100).toFixed(0)}%) — overbought zone` });
  else scores.push({ factor: "Bollinger Bands", score: 0, reason: `Price mid-range in BB (${(bb.percentB * 100).toFixed(0)}%)` });

  const technicalScore = scores.reduce((sum, s) => sum + s.score, 0);
  const keyFactors = scores.map(s => s.reason);

  let signal: "CALL" | "PUT" | "WAIT";
  let confidence: number;
  let reasoning: string;

  if (technicalScore >= 30) {
    signal = "CALL";
    confidence = Math.min(50 + technicalScore * 0.7, 92);
    reasoning = `Strong bullish confluence (score: +${technicalScore}). Multiple indicators align for upside momentum. A CALL position offers the best risk-adjusted entry with defined risk on premium.`;
  } else if (technicalScore <= -30) {
    signal = "PUT";
    confidence = Math.min(50 + Math.abs(technicalScore) * 0.7, 92);
    reasoning = `Strong bearish confluence (score: ${technicalScore}). Downside pressure confirmed across multiple timeframes. A PUT position offers the best risk-adjusted entry.`;
  } else if (technicalScore > 10) {
    signal = "CALL";
    confidence = 40 + technicalScore * 0.5;
    reasoning = `Moderate bullish lean (score: +${technicalScore}). Signal is directional but not high conviction — consider smaller size or wait for confirmation.`;
  } else if (technicalScore < -10) {
    signal = "PUT";
    confidence = 40 + Math.abs(technicalScore) * 0.5;
    reasoning = `Moderate bearish lean (score: ${technicalScore}). Signal is directional but not high conviction — consider smaller size or wait for confirmation.`;
  } else {
    signal = "WAIT";
    confidence = 30 + Math.abs(technicalScore) * 2;
    reasoning = `No clear edge (score: ${technicalScore}). Mixed signals — best to wait for clearer directional confirmation before opening options positions.`;
  }

  confidence = Math.round(Math.min(Math.max(confidence, 25), 92));

  if (signal === "WAIT") {
    return { symbol: "SPY", timestamp: new Date().toISOString(), currentPrice, signal, confidence, reasoning, keyFactors, technicalScore, trade: null };
  }

  const side = signal as "CALL" | "PUT";
  const isCall = side === "CALL";

  // Attempt to fetch live options chain
  let contract = await fetchOptionsChain(currentPrice, side, atr);

  // Fallback: estimate from ATR/IV if chain unavailable
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

  // Premium levels
  const premiumStop = round2(pe * 0.45);   // lose 55%
  const premiumT1 = round2(pe * 2.0);      // 100% gain
  const premiumT2 = round2(pe * 3.5);      // 250% gain

  // Underlying levels: use ATR fractions
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
