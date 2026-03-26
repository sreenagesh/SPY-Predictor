import YahooFinanceClass from "yahoo-finance2";
import {
  fetchSpyHistory,
  computeAtr,
  computeMomentumScore,
  computeRsi,
  computeSma,
  computeMacd,
  computeBollingerBands,
} from "./spy-data.js";
import {
  getMarketStatus,
  getSwingExpiry,
  getNextTradingDate,
  daysUntil,
} from "./market-utils.js";
import type { TradingSignal, TradingTradeSetup } from "./intraday-signal.js";

const yahooFinance = new YahooFinanceClass();

function estimateSwingPremium(
  currentPrice: number,
  strike: number,
  isCall: boolean,
  dte: number
): number {
  const iv = 0.18;
  const t = dte / 365;
  const intrinsic = isCall
    ? Math.max(0, currentPrice - strike)
    : Math.max(0, strike - currentPrice);
  const timeValue = currentPrice * iv * Math.sqrt(t) * 0.4;
  return Math.max(intrinsic + timeValue, 0.10);
}

type SwingContract = {
  strike: number; expiration: string; daysToExpiry: number;
  premiumEntry: number; impliedVolatility: number | null;
  delta: number | null; openInterest: number | null; volume: number | null;
};

async function fetchSwingOptions(
  currentPrice: number,
  side: "CALL" | "PUT",
): Promise<SwingContract | null> {
  const expiry = getSwingExpiry(3); // 3–7 DTE Friday
  const dte = daysUntil(expiry);
  const isCall = side === "CALL";
  const expiryStr = expiry.toISOString().split("T")[0];
  // Slightly OTM for swing
  const otmOffset = isCall ? 1 : -1;
  const targetStrike = Math.round(currentPrice) + otmOffset;

  // ── 1. Tradier real-time chain ──────────────────────────────────────────────
  const TRADIER_TOKEN = process.env.TRADIER_API_KEY;
  if (TRADIER_TOKEN) {
    try {
      const url = `https://api.tradier.com/v1/markets/options/chains?symbol=SPY&expiration=${expiryStr}&greeks=true`;
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${TRADIER_TOKEN}`, Accept: "application/json" },
      });
      if (res.ok) {
        const json = await res.json();
        const options: any[] = json?.options?.option ?? [];
        const sideOpts = options.filter((o: any) => o.option_type === (isCall ? "call" : "put"));
        const sorted = [...sideOpts].sort(
          (a: any, b: any) => Math.abs(a.strike - targetStrike) - Math.abs(b.strike - targetStrike),
        );
        for (const opt of sorted.slice(0, 5)) {
          const bid: number = opt.bid ?? 0;
          const ask: number = opt.ask ?? 0;
          const mid = bid > 0 && ask > 0 ? (bid + ask) / 2 : 0;
          const last: number = opt.last ?? 0;
          const iv: number | null = opt.greeks?.mid_iv ?? opt.greeks?.ask_iv ?? null;
          const premiumEntry = mid > 0 ? mid : last > 0 ? last :
            estimateSwingPremium(currentPrice, opt.strike, isCall, dte);
          return {
            strike: opt.strike,
            expiration: expiryStr,
            daysToExpiry: dte,
            premiumEntry: Math.round(premiumEntry * 100) / 100,
            impliedVolatility: iv != null ? Math.round(iv * 10000) / 100 : null,
            delta: opt.greeks?.delta != null ? Math.round(opt.greeks.delta * 1000) / 1000 : null,
            openInterest: opt.open_interest ?? null,
            volume: opt.volume ?? null,
          };
        }
      }
    } catch { /* fall through */ }
  }

  // ── 2. Yahoo Finance fallback — skip zero-priced contracts ─────────────────
  try {
    const optionsData = await yahooFinance.options("SPY");
    if (!optionsData?.options?.length) return null;
    const chain = optionsData.options[0];
    const contracts = isCall ? chain.calls : chain.puts;
    if (!contracts?.length) return null;
    const sorted = [...contracts].sort(
      (a, b) => Math.abs(a.strike - targetStrike) - Math.abs(b.strike - targetStrike),
    );
    for (const best of sorted.slice(0, 5)) {
      const bid = best.bid ?? 0;
      const ask = best.ask ?? 0;
      const mid = bid > 0 && ask > 0 ? (bid + ask) / 2 : 0;
      const last = best.lastPrice ?? 0;
      if (mid === 0 && last === 0) continue;
      const premiumEntry = mid > 0 ? mid : last > 0 ? last :
        estimateSwingPremium(currentPrice, best.strike, isCall, dte);
      return {
        strike: best.strike,
        expiration: expiryStr,
        daysToExpiry: dte,
        premiumEntry: Math.round(premiumEntry * 100) / 100,
        impliedVolatility: best.impliedVolatility != null && best.impliedVolatility > 0
          ? Math.round(best.impliedVolatility * 10000) / 100 : null,
        delta: "delta" in best && (best as any).delta != null
          ? Math.round((best as any).delta * 1000) / 1000 : null,
        openInterest: best.openInterest ?? null,
        volume: best.volume ?? null,
      };
    }
  } catch { /* fall through */ }

  return null;
}

export async function computeSwingSignal(): Promise<TradingSignal> {
  const bars = await fetchSpyHistory("6mo");
  if (bars.length < 30) throw new Error("Insufficient daily data");

  const closes = bars.map(b => b.close);
  const currentPrice = closes[closes.length - 1];
  const atr = computeAtr(bars, 14);
  const marketStatus = getMarketStatus();

  // Primary signal: short-term momentum on daily bars
  const { score: momentumScore, factors: momentumFactors } = computeMomentumScore(bars);

  const allScores: { factor: string; score: number; reason: string }[] = [];
  for (const mf of momentumFactors) {
    allScores.push({ factor: mf.label, score: mf.score, reason: mf.detail });
  }

  // Add medium-term context (reduced weight vs old approach)
  const sma20 = computeSma(closes, 20);
  const sma50 = computeSma(closes, 50);
  const sma200 = computeSma(closes, Math.min(200, closes.length));
  const bb = computeBollingerBands(closes, 20);

  const aboveSma20 = currentPrice > sma20;
  const aboveSma50 = currentPrice > sma50;
  if (aboveSma20 && aboveSma50 && sma20 > sma50) {
    allScores.push({ factor: "Trend", score: 10, reason: "Price above SMA20 & SMA50 — bullish daily structure" });
  } else if (!aboveSma20 && !aboveSma50 && sma20 < sma50) {
    allScores.push({ factor: "Trend", score: -10, reason: "Price below SMA20 & SMA50 — bearish daily structure" });
  } else {
    allScores.push({ factor: "Trend", score: aboveSma20 ? 4 : -4, reason: `Mixed SMA alignment — ${aboveSma20 ? "price above SMA20" : "price below SMA20"}` });
  }

  if (bb.percentB < 0.1) {
    allScores.push({ factor: "Bollinger", score: 12, reason: `BB lower extreme (${(bb.percentB * 100).toFixed(0)}%) — mean reversion setup` });
  } else if (bb.percentB > 0.9) {
    allScores.push({ factor: "Bollinger", score: -12, reason: `BB upper extreme (${(bb.percentB * 100).toFixed(0)}%) — mean reversion risk` });
  }

  // Long-term context: minimal weight
  if (sma50 > sma200) {
    allScores.push({ factor: "Long-term", score: 5, reason: `Golden cross — SMA50 > SMA200 (bullish macro background)` });
  } else {
    allScores.push({ factor: "Long-term", score: -5, reason: `Death cross — SMA50 < SMA200 (bearish macro background)` });
  }

  const totalScore = allScores.reduce((sum, s) => sum + s.score, 0);

  const keyFactors = allScores
    .sort((a, b) => Math.abs(b.score) - Math.abs(a.score))
    .slice(0, 6)
    .map(s => s.reason);

  let signal: "CALL" | "PUT" | "WAIT";
  let confidence: number;
  let reasoning: string;

  // Swing: require stronger signal since we're holding overnight
  if (totalScore >= 45) {
    signal = "CALL";
    confidence = Math.min(50 + totalScore * 0.55, 90);
    reasoning = `Strong daily bullish confluence (score: +${totalScore}). Entry recommended near 3:45 PM EST for BTST. Buy CALL option ${getSwingExpiry(3).toLocaleDateString("en-US", { month: "short", day: "numeric" })} expiry — hold overnight and look to exit at open or on momentum.`;
  } else if (totalScore <= -45) {
    signal = "PUT";
    confidence = Math.min(50 + Math.abs(totalScore) * 0.55, 90);
    reasoning = `Strong daily bearish confluence (score: ${totalScore}). Entry recommended near 3:45 PM EST for BTST. Buy PUT option ${getSwingExpiry(3).toLocaleDateString("en-US", { month: "short", day: "numeric" })} expiry — hold overnight and look to exit at open or on momentum.`;
  } else if (totalScore >= 22) {
    signal = "CALL";
    confidence = 38 + totalScore * 0.45;
    reasoning = `Moderate bullish daily lean (score: +${totalScore}). Swing signal is directional but not high conviction. Consider half-size CALL or wait for cleaner setup.`;
  } else if (totalScore <= -22) {
    signal = "PUT";
    confidence = 38 + Math.abs(totalScore) * 0.45;
    reasoning = `Moderate bearish daily lean (score: ${totalScore}). Swing signal is directional but not high conviction. Consider half-size PUT or wait for cleaner setup.`;
  } else {
    signal = "WAIT";
    confidence = 28 + Math.abs(totalScore);
    reasoning = `No clear overnight edge (score: ${totalScore}). Daily indicators are mixed — do not risk holding options overnight without a clear directional signal. Check again near 3:45 PM EST.`;
  }

  confidence = Math.round(Math.min(Math.max(confidence, 22), 90));

  if (signal === "WAIT") {
    return {
      mode: "swing",
      signal,
      confidence,
      score: totalScore,
      reasoning,
      keyFactors,
      currentPrice,
      timestamp: new Date().toISOString(),
      marketStatus,
      nextBarIn: null,
      targetDate: getNextTradingDate(),
      bars: bars.slice(-90), // 90 daily bars for chart
      trade: null,
    };
  }

  const side = signal as "CALL" | "PUT";
  const isCall = side === "CALL";

  let contract = await fetchSwingOptions(currentPrice, side);

  if (!contract) {
    const expiry = getSwingExpiry(3);
    const dte = daysUntil(expiry);
    const strike = isCall
      ? Math.round(currentPrice) + 1
      : Math.round(currentPrice) - 1;
    const pe = estimateSwingPremium(currentPrice, strike, isCall, dte);
    contract = {
      strike,
      expiration: expiry.toISOString().split("T")[0],
      daysToExpiry: dte,
      premiumEntry: Math.round(pe * 100) / 100,
      impliedVolatility: 18,
      delta: isCall ? 0.45 : -0.45,
      openInterest: null,
      volume: null,
    };
  }

  const round2 = (n: number) => Math.round(n * 100) / 100;
  const pe = contract.premiumEntry;

  // Swing premium targets: wider stop, bigger gains for overnight hold
  const premiumStop = round2(pe * 0.50);  // -50% stop (hold overnight needs room)
  const premiumT1   = round2(pe * 2.00);  // +100% (T1 — take half off)
  const premiumT2   = round2(pe * 4.00);  // +300% (T2 — let it run)

  // Underlying levels using daily ATR
  const underlyingEntry = round2(currentPrice);
  const underlyingStop  = round2(isCall ? currentPrice - atr * 0.40 : currentPrice + atr * 0.40);
  const underlyingT1    = round2(isCall ? currentPrice + atr * 0.55 : currentPrice - atr * 0.55);
  const underlyingT2    = round2(isCall ? currentPrice + atr * 1.10 : currentPrice - atr * 1.10);

  return {
    mode: "swing",
    signal,
    confidence,
    score: totalScore,
    reasoning,
    keyFactors,
    currentPrice,
    timestamp: new Date().toISOString(),
    marketStatus,
    nextBarIn: null,
    targetDate: getNextTradingDate(),
    bars: bars.slice(-90),
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
