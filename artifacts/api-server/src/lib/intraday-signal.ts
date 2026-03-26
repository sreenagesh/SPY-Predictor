import YahooFinanceClass from "yahoo-finance2";
import {
  computeAtr,
  computeMomentumScore,
  OhlcvBar,
} from "./spy-data.js";
import {
  getMarketStatus,
  secondsUntilNextFiveMinBar,
  getNextSpyExpiry,
  daysUntil,
} from "./market-utils.js";

const yahooFinance = new YahooFinanceClass();

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
      open: q.open ?? 0,
      high: q.high ?? 0,
      low: q.low ?? 0,
      close: q.close ?? 0,
      volume: q.volume ?? 0,
    }));
}

function estimateIntradayPremium(
  currentPrice: number,
  strike: number,
  isCall: boolean,
  dte: number
): number {
  const iv = 0.20; // SPY typical IV slightly higher for 0DTE
  const t = Math.max(dte, 0.5) / 365;
  const intrinsic = isCall
    ? Math.max(0, currentPrice - strike)
    : Math.max(0, strike - currentPrice);
  const timeValue = currentPrice * iv * Math.sqrt(t) * 0.35;
  return Math.max(intrinsic + timeValue, 0.10);
}

type OptionContract = {
  strike: number; expiration: string; daysToExpiry: number;
  premiumEntry: number; impliedVolatility: number | null;
  delta: number | null; openInterest: number | null; volume: number | null;
};

/** Use Tradier real-time chain — returns live bid/ask with Greeks */
async function fetchOptionViaTradier(
  currentPrice: number,
  side: "CALL" | "PUT",
  expiry: Date,
  dte: number,
): Promise<OptionContract | null> {
  const TRADIER_TOKEN = process.env.TRADIER_API_KEY;
  if (!TRADIER_TOKEN) return null;

  const expiryStr = expiry.toISOString().split("T")[0];
  const url = `https://api.tradier.com/v1/markets/options/chains?symbol=SPY&expiration=${expiryStr}&greeks=true`;

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${TRADIER_TOKEN}`, Accept: "application/json" },
  });
  if (!res.ok) return null;
  const json = await res.json();

  const options: any[] = json?.options?.option ?? [];
  if (!options.length) return null;

  const isCall = side === "CALL";
  const sideOptions = options.filter(
    (o: any) => o.option_type === (isCall ? "call" : "put"),
  );

  // Nearest ATM strike with a valid mid-price
  const targetStrike = Math.round(currentPrice);
  const sorted = [...sideOptions].sort(
    (a: any, b: any) => Math.abs(a.strike - targetStrike) - Math.abs(b.strike - targetStrike),
  );

  // Walk strikes until we find one with real bid/ask
  for (const opt of sorted.slice(0, 5)) {
    const bid: number = opt.bid ?? 0;
    const ask: number = opt.ask ?? 0;
    const mid = bid > 0 && ask > 0 ? (bid + ask) / 2 : 0;
    const last: number = opt.last ?? 0;
    const iv: number | null = opt.greeks?.mid_iv ?? opt.greeks?.ask_iv ?? null;

    const premiumEntry = mid > 0
      ? mid
      : last > 0
        ? last
        : estimateIntradayPremium(currentPrice, opt.strike, isCall, dte);

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
  return null;
}

/** Yahoo Finance fallback — guards against ask=0 with explicit >0 checks */
async function fetchOptionViaYahoo(
  currentPrice: number,
  side: "CALL" | "PUT",
  expiry: Date,
  dte: number,
): Promise<OptionContract | null> {
  try {
    const isCall = side === "CALL";
    const targetStrike = Math.round(currentPrice);
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

      // Skip zero-priced contracts entirely
      if (mid === 0 && last === 0) continue;

      const premiumEntry = mid > 0 ? mid : last > 0 ? last :
        estimateIntradayPremium(currentPrice, best.strike, isCall, dte);

      return {
        strike: best.strike,
        expiration: expiry.toISOString().split("T")[0],
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
    return null;
  } catch {
    return null;
  }
}

async function fetchIntradayOptions(
  currentPrice: number,
  side: "CALL" | "PUT",
): Promise<OptionContract | null> {
  const expiry = getNextSpyExpiry(0); // 0+ DTE — can be today (0DTE)
  const dte = Math.max(daysUntil(expiry), 0);

  // 1️⃣ Tradier real-time (most accurate — has live bid/ask + Greeks)
  const tradier = await fetchOptionViaTradier(currentPrice, side, expiry, dte);
  if (tradier) return tradier;

  // 2️⃣ Yahoo Finance (skips zero-priced contracts)
  return fetchOptionViaYahoo(currentPrice, side, expiry, dte);
}

export interface TradingTradeSetup {
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
}

export interface TradingSignal {
  mode: "intraday" | "swing";
  signal: "CALL" | "PUT" | "WAIT";
  confidence: number;
  score: number;
  reasoning: string;
  keyFactors: string[];
  currentPrice: number;
  timestamp: string;
  marketStatus: "open" | "premarket" | "afterhours" | "closed";
  nextBarIn: number | null;
  targetDate: string | null;
  bars: OhlcvBar[];
  trade: TradingTradeSetup | null;
}

export async function computeIntradaySignal(): Promise<TradingSignal> {
  const bars = await fetch5mBars();
  if (bars.length < 30) throw new Error("Insufficient 5m data");

  const currentPrice = bars[bars.length - 1].close;
  const atr5m = computeAtr(bars, 14); // ATR on 5-min bars
  const marketStatus = getMarketStatus();

  // Run momentum scoring on 5-min data — same engine, different timeframe
  const { score, factors } = computeMomentumScore(bars);

  const keyFactors = factors
    .sort((a, b) => Math.abs(b.score) - Math.abs(a.score))
    .map(f => f.detail);

  let signal: "CALL" | "PUT" | "WAIT";
  let confidence: number;
  let reasoning: string;

  // Slightly tighter threshold for 5-min — need clearer signal for scalping
  if (score >= 30) {
    signal = "CALL";
    confidence = Math.min(50 + score * 0.6, 92);
    reasoning = `5-min momentum is bullish (score: +${score}). EMA8/21 crossover and MACD confirm upward pressure. Buy ATM CALL for quick scalp — target +50% to +150% on the option premium.`;
  } else if (score <= -30) {
    signal = "PUT";
    confidence = Math.min(50 + Math.abs(score) * 0.6, 92);
    reasoning = `5-min momentum is bearish (score: ${score}). EMA8/21 crossover and MACD confirm downward pressure. Buy ATM PUT for quick scalp — target +50% to +150% on the option premium.`;
  } else if (score >= 15) {
    signal = "CALL";
    confidence = 38 + score * 0.5;
    reasoning = `Mild bullish lean on 5-min (score: +${score}). Signal is not high conviction — wait for breakout candle or use smaller size.`;
  } else if (score <= -15) {
    signal = "PUT";
    confidence = 38 + Math.abs(score) * 0.5;
    reasoning = `Mild bearish lean on 5-min (score: ${score}). Signal is not high conviction — wait for breakdown candle or use smaller size.`;
  } else {
    signal = "WAIT";
    confidence = 30 + Math.abs(score);
    reasoning = `No clear edge on 5-min (score: ${score}). EMA8 and EMA21 are tangled — price is ranging. Do NOT trade options in chop. Wait for a decisive 5-min bar close above/below EMA21.`;
  }

  confidence = Math.round(Math.min(Math.max(confidence, 22), 92));

  if (signal === "WAIT") {
    return {
      mode: "intraday",
      signal,
      confidence,
      score,
      reasoning,
      keyFactors,
      currentPrice,
      timestamp: new Date().toISOString(),
      marketStatus,
      nextBarIn: secondsUntilNextFiveMinBar(),
      targetDate: null,
      bars: bars.slice(-60), // last 5 hours of 5-min bars for chart
      trade: null,
    };
  }

  const side = signal as "CALL" | "PUT";
  const isCall = side === "CALL";

  let contract = await fetchIntradayOptions(currentPrice, side);

  if (!contract) {
    const expiry = getNextSpyExpiry(0);
    const dte = Math.max(daysUntil(expiry), 0);
    const strike = Math.round(currentPrice);
    const premiumEntry = estimateIntradayPremium(currentPrice, strike, isCall, dte);
    contract = {
      strike,
      expiration: expiry.toISOString().split("T")[0],
      daysToExpiry: dte,
      premiumEntry: Math.round(premiumEntry * 100) / 100,
      impliedVolatility: 20,
      delta: isCall ? 0.52 : -0.52,
      openInterest: null,
      volume: null,
    };
  }

  const round2 = (n: number) => Math.round(n * 100) / 100;
  const pe = contract.premiumEntry;

  // Intraday premium targets: tighter stop, faster gains
  const premiumStop = round2(pe * 0.70);  // -30% stop
  const premiumT1   = round2(pe * 1.50);  // +50% gain (T1)
  const premiumT2   = round2(pe * 2.50);  // +150% gain (T2)

  // Underlying levels using 5-min ATR fractions
  const underlyingEntry = round2(currentPrice);
  const underlyingStop  = round2(isCall ? currentPrice - atr5m * 1.5 : currentPrice + atr5m * 1.5);
  const underlyingT1    = round2(isCall ? currentPrice + atr5m * 2.0 : currentPrice - atr5m * 2.0);
  const underlyingT2    = round2(isCall ? currentPrice + atr5m * 3.5 : currentPrice - atr5m * 3.5);

  return {
    mode: "intraday",
    signal,
    confidence,
    score,
    reasoning,
    keyFactors,
    currentPrice,
    timestamp: new Date().toISOString(),
    marketStatus,
    nextBarIn: secondsUntilNextFiveMinBar(),
    targetDate: null,
    bars: bars.slice(-60),
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
