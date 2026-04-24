import { Router } from "express";
import YahooFinanceClass from "yahoo-finance2";
import {
  computeMomentumScore,
  computeAtr,
  type OhlcvBar,
} from "../lib/spy-data";

const router = Router();
const yf = new YahooFinanceClass();

const TRADIER_TOKEN = process.env.TRADIER_API_KEY;
const TRADIER_BASE = "https://api.tradier.com/v1";

const TICKERS = [
  "SPY", "QQQ", "NVDA", "AAPL", "ORCL",
  "PLTR", "MSFT", "NFLX", "AMZN", "GLD", "SLV", "USO",
];

// ─── Tradier API helpers ──────────────────────────────────────────────────────

interface TradierQuote {
  symbol: string;
  last: number | null;
  bid: number;
  ask: number;
  change: number;
  change_percentage: number;
  volume: number;
  description: string;
}

interface TradierGreeks {
  delta: number;
  gamma: number;
  theta: number;
  vega: number;
  mid_iv: number;
  bid_iv: number;
  ask_iv: number;
}

interface TradierOption {
  symbol: string;
  bid: number;
  ask: number;
  volume: number;
  open_interest: number;
  strike: number;
  expiration_date: string;
  option_type: "call" | "put";
  root_symbol: string;
  greeks?: TradierGreeks;
}

async function tradierGet(path: string): Promise<any> {
  if (!TRADIER_TOKEN) throw new Error("TRADIER_API_KEY not configured");
  const res = await fetch(`${TRADIER_BASE}${path}`, {
    headers: {
      Authorization: `Bearer ${TRADIER_TOKEN}`,
      Accept: "application/json",
    },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Tradier ${path} → ${res.status}: ${text.slice(0, 300)}`);
  }
  return res.json();
}

async function fetchQuotes(symbols: string[]): Promise<Map<string, TradierQuote>> {
  const data = await tradierGet(`/markets/quotes?symbols=${symbols.join(",")}&greeks=false`);
  const quotes = data?.quotes?.quote;
  const arr: TradierQuote[] = Array.isArray(quotes) ? quotes : (quotes ? [quotes] : []);
  const map = new Map<string, TradierQuote>();
  for (const q of arr) {
    if (q?.symbol) map.set(q.symbol, q);
  }
  return map;
}

async function fetchExpirations(symbol: string): Promise<string[]> {
  try {
    const data = await tradierGet(`/markets/options/expirations?symbol=${symbol}&includeAllRoots=false`);
    const exps = data?.expirations?.date;
    if (!exps) return [];
    return Array.isArray(exps) ? exps : [exps];
  } catch {
    return [];
  }
}

async function fetchChain(symbol: string, expiration: string): Promise<TradierOption[]> {
  try {
    const data = await tradierGet(`/markets/options/chains?symbol=${symbol}&expiration=${expiration}&greeks=true`);
    const opts = data?.options?.option;
    if (!opts) return [];
    return Array.isArray(opts) ? opts : [opts];
  } catch {
    return [];
  }
}

// ─── Date helpers ─────────────────────────────────────────────────────────────

function daysToExpiry(expDate: string): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const exp = new Date(expDate + "T00:00:00Z");
  return Math.round((exp.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

function findExpiration(
  expirations: string[],
  minDte: number,
  maxDte: number,
): string | null {
  for (const exp of expirations) {
    const dte = daysToExpiry(exp);
    if (dte >= minDte && dte <= maxDte) return exp;
  }
  return null;
}

// ─── Momentum scoring via Yahoo Finance ──────────────────────────────────────

async function computeTickerMomentum(
  symbol: string,
): Promise<{ score: number; bars: OhlcvBar[] }> {
  try {
    const period1 = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
    const result = await yf.chart(symbol, { period1, interval: "1d" as any });
    if (!result.quotes || result.quotes.length < 20) return { score: 0, bars: [] };

    const bars: OhlcvBar[] = result.quotes
      .filter((q: any) => q.open != null && q.close != null)
      .map((q: any) => ({
        date: q.date instanceof Date ? q.date.toISOString() : String(q.date),
        open: q.open ?? 0,
        high: q.high ?? 0,
        low: q.low ?? 0,
        close: q.close ?? 0,
        volume: q.volume ?? 0,
      }));

    const { score } = computeMomentumScore(bars);
    return { score, bars };
  } catch {
    return { score: 0, bars: [] };
  }
}

// ─── Option scoring ───────────────────────────────────────────────────────────

function scoreOption(
  opt: TradierOption,
  side: "CALL" | "PUT",
  absScore: number,
): number {
  const optSide = opt.option_type === "call" ? "CALL" : "PUT";
  if (optSide !== side) return -Infinity;
  if (!opt.ask || opt.ask <= 0) return -Infinity;
  if (!opt.bid || opt.bid <= 0) return -Infinity;

  const delta = Math.abs(opt.greeks?.delta ?? 0);
  if (delta === 0) return -Infinity;

  // Delta quality: ideal range 0.35–0.60, peak at 0.45
  const deltaScore = Math.max(0, 1 - Math.abs(delta - 0.45) / 0.35) * 30;

  // Momentum conviction
  const momentumScore = (absScore / 100) * 35;

  // Premium: prefer $0.30–$8 range
  const prem = opt.ask;
  const premiumScore =
    prem < 0.10 ? 0
    : prem <= 8 ? (1 - (prem / 8)) * 20
    : Math.max(0, 20 - (prem - 8) * 1.5);

  // Liquidity: OI (cap at 10k)
  const oi = opt.open_interest ?? 0;
  const liquidityScore = Math.min(oi / 10000, 1) * 10;

  // Volume
  const vol = opt.volume ?? 0;
  const volumeScore = Math.min(vol / 5000, 1) * 5;

  // Spread tightness
  const spread = opt.ask - opt.bid;
  const spreadPct = opt.ask > 0 ? spread / opt.ask : 1;
  const spreadScore = Math.max(0, 1 - spreadPct / 0.40) * 10;

  return deltaScore + momentumScore + premiumScore + liquidityScore + volumeScore + spreadScore;
}

// ─── Build best option candidate from a chain ─────────────────────────────────

interface BestOptionCandidate {
  symbol: string;
  side: "CALL" | "PUT";
  strike: number;
  expiration: string;
  daysToExpiry: number;
  currentPrice: number;
  entry: number;
  sl: number;
  t1: number;
  t2: number;
  t3: number;
  delta: number;
  iv: number;
  openInterest: number;
  volume: number;
  momentumScore: number;
  compositeScore: number;
  reason: string;
  underlyingT1: number;
  underlyingT2: number;
  underlyingT3: number;
}

function buildCandidate(
  opt: TradierOption,
  symbol: string,
  side: "CALL" | "PUT",
  currentPrice: number,
  momentumScore: number,
  score: number,
): BestOptionCandidate {
  const entry = Math.round((opt.ask + opt.bid) / 2 * 100) / 100 || opt.ask;
  const sl   = Math.round(entry * 0.50 * 100) / 100;
  const t1   = Math.round(entry * 1.50 * 100) / 100;
  const t2   = Math.round(entry * 2.50 * 100) / 100;
  const t3   = Math.round(entry * 4.00 * 100) / 100;

  const delta  = Math.abs(opt.greeks?.delta ?? 0.45);
  const iv     = (opt.greeks?.mid_iv ?? 0) * 100;
  const oi     = opt.open_interest ?? 0;
  const vol    = opt.volume ?? 0;
  const dte    = daysToExpiry(opt.expiration_date);

  // Where does the underlying need to be?
  // Δ_underlying = Δ_option_gain / delta
  const gainT1 = t1 - entry;
  const gainT2 = t2 - entry;
  const gainT3 = t3 - entry;

  const direction = side === "CALL" ? 1 : -1;
  const underlyingT1 = Math.round((currentPrice + direction * gainT1 / Math.max(delta, 0.05)) * 100) / 100;
  const underlyingT2 = Math.round((currentPrice + direction * gainT2 / Math.max(delta, 0.05)) * 100) / 100;
  const underlyingT3 = Math.round((currentPrice + direction * gainT3 / Math.max(delta, 0.05)) * 100) / 100;

  const spreadPct = opt.ask > 0 ? ((opt.ask - opt.bid) / opt.ask * 100).toFixed(0) : "?";
  const reason = [
    `${Math.abs(momentumScore) > 60 ? "Strong" : "Moderate"} ${momentumScore > 0 ? "bullish" : "bearish"} momentum (${momentumScore > 0 ? "+" : ""}${momentumScore})`,
    `Delta ${delta.toFixed(2)}`,
    oi > 5000 ? `High OI (${oi.toLocaleString()})` : oi > 1000 ? `OI ${oi.toLocaleString()}` : `OI ${oi.toLocaleString()}`,
    iv > 0 ? `IV ${iv.toFixed(0)}%` : null,
    `Spread ${spreadPct}%`,
  ].filter(Boolean).join(" · ");

  return {
    symbol,
    side,
    strike: opt.strike,
    expiration: opt.expiration_date,
    daysToExpiry: dte,
    currentPrice,
    entry,
    sl,
    t1,
    t2,
    t3,
    delta,
    iv,
    openInterest: oi,
    volume: vol,
    momentumScore,
    compositeScore: Math.round(score),
    reason,
    underlyingT1,
    underlyingT2,
    underlyingT3,
  };
}

// ─── Main scanner ─────────────────────────────────────────────────────────────

async function runBestOptionsScanner(): Promise<{
  intraday: BestOptionCandidate[];
  weekly: BestOptionCandidate[];
  scannedAt: string;
  marketOpen: boolean;
}> {
  // Step 1: Batch quotes + momentum in parallel
  const [quotesMap, momentumResults] = await Promise.all([
    fetchQuotes(TICKERS),
    Promise.all(TICKERS.map(t => computeTickerMomentum(t).then(r => ({ symbol: t, ...r })))),
  ]);

  // Step 2: Build ticker context (price from Tradier quote preferred, fallback to Yahoo)
  const tickerCtx = TICKERS.map(symbol => {
    const q = quotesMap.get(symbol);
    const mom = momentumResults.find(m => m.symbol === symbol);
    const bars = mom?.bars ?? [];
    const score = mom?.score ?? 0;
    const currentPrice = (q?.last ?? q?.ask ?? bars[bars.length - 1]?.close ?? 0);
    return { symbol, score, currentPrice, bars };
  });

  // Step 3: Pick direction per ticker (need |score| >= 20 to be considered)
  const candidates = tickerCtx
    .filter(t => Math.abs(t.score) >= 20 && t.currentPrice > 0)
    .map(t => ({ ...t, side: (t.score > 0 ? "CALL" : "PUT") as "CALL" | "PUT" }));

  // Sort by conviction (strongest momentum first), take top 10
  candidates.sort((a, b) => Math.abs(b.score) - Math.abs(a.score));
  const topCandidates = candidates.slice(0, 10);

  if (topCandidates.length === 0) {
    return { intraday: [], weekly: [], scannedAt: new Date().toISOString(), marketOpen: false };
  }

  // Step 4: Fetch expirations for all top candidates in parallel
  const expirationResults = await Promise.all(
    topCandidates.map(tc =>
      fetchExpirations(tc.symbol).then(exps => ({ symbol: tc.symbol, exps }))
    )
  );
  const expMap = new Map(expirationResults.map(r => [r.symbol, r.exps]));

  // Step 5: Determine expiration dates for intraday (0–3 DTE) and weekly (4–10 DTE)
  const chainFetches: Array<{
    symbol: string;
    timeframe: "intraday" | "weekly";
    expiration: string;
    side: "CALL" | "PUT";
    score: number;
    currentPrice: number;
  }> = [];

  for (const tc of topCandidates) {
    const exps = expMap.get(tc.symbol) ?? [];
    const intradayExp = findExpiration(exps, 0, 3) ?? findExpiration(exps, 0, 5);
    const weeklyExp = findExpiration(exps, 4, 10) ?? findExpiration(exps, 4, 14);

    if (intradayExp) {
      chainFetches.push({ symbol: tc.symbol, timeframe: "intraday", expiration: intradayExp, side: tc.side, score: tc.score, currentPrice: tc.currentPrice });
    }
    if (weeklyExp) {
      chainFetches.push({ symbol: tc.symbol, timeframe: "weekly", expiration: weeklyExp, side: tc.side, score: tc.score, currentPrice: tc.currentPrice });
    }
  }

  // Step 6: Fetch chains in parallel (batch of up to 20)
  const chainResults = await Promise.all(
    chainFetches.map(async cf => {
      const chain = await fetchChain(cf.symbol, cf.expiration);
      return { ...cf, chain };
    })
  );

  // Step 7: For each chain, find the best option and build a candidate
  const intradayCandidates: BestOptionCandidate[] = [];
  const weeklyCandidates: BestOptionCandidate[] = [];

  for (const cr of chainResults) {
    const { symbol, timeframe, side, score, currentPrice, chain } = cr;

    // Filter to strikes within ±15% of current price
    const filtered = chain.filter(opt => {
      const pctDist = Math.abs(opt.strike - currentPrice) / currentPrice;
      return pctDist <= 0.15 && opt.ask > 0 && opt.bid > 0;
    });

    if (filtered.length === 0) continue;

    // Score each option
    const scored = filtered
      .map(opt => ({ opt, s: scoreOption(opt, side, Math.abs(score)) }))
      .filter(x => x.s > -Infinity)
      .sort((a, b) => b.s - a.s);

    if (scored.length === 0) continue;

    const best = scored[0];
    const candidate = buildCandidate(best.opt, symbol, side, currentPrice, score, best.s);

    if (timeframe === "intraday") {
      intradayCandidates.push(candidate);
    } else {
      weeklyCandidates.push(candidate);
    }
  }

  // Step 8: Sort by composite score and return top 3
  intradayCandidates.sort((a, b) => b.compositeScore - a.compositeScore);
  weeklyCandidates.sort((a, b) => b.compositeScore - a.compositeScore);

  // Is market open? (check if any quote has a non-null last price)
  const marketOpen = [...quotesMap.values()].some(q => q.last != null && q.volume > 0);

  return {
    intraday: intradayCandidates.slice(0, 3),
    weekly: weeklyCandidates.slice(0, 3),
    scannedAt: new Date().toISOString(),
    marketOpen,
  };
}

// ─── In-memory cache ──────────────────────────────────────────────────────────

interface CacheEntry {
  data: Awaited<ReturnType<typeof runBestOptionsScanner>>;
  cachedAt: number;
}

let cache: CacheEntry | null = null;
let scanInProgress = false;
const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes

async function getScanResult(force = false): Promise<CacheEntry["data"]> {
  const now = Date.now();
  const isFresh = cache && (now - cache.cachedAt) < CACHE_TTL_MS;

  if (isFresh && !force) {
    return cache!.data;
  }

  // If a scan is already running, wait up to 30s for it to finish
  if (scanInProgress) {
    const deadline = now + 30_000;
    while (scanInProgress && Date.now() < deadline) {
      await new Promise(r => setTimeout(r, 500));
    }
    if (cache) return cache.data;
  }

  // Run a fresh scan
  scanInProgress = true;
  try {
    const result = await runBestOptionsScanner();
    cache = { data: result, cachedAt: Date.now() };
    return result;
  } finally {
    scanInProgress = false;
  }
}

// Trigger a background refresh (fire-and-forget, ignores errors)
function backgroundRefresh() {
  if (scanInProgress) return;
  getScanResult(true).catch(err =>
    console.error("[best-options] background refresh error:", err)
  );
}

// ─── Pre-warm cache 8 seconds after server starts ─────────────────────────────
if (TRADIER_TOKEN) {
  setTimeout(() => {
    console.log("[best-options] Pre-warming scanner cache…");
    getScanResult(true)
      .then(r => console.log(`[best-options] Cache ready — ${r.intraday.length} intraday, ${r.weekly.length} weekly picks`))
      .catch(err => console.error("[best-options] Pre-warm error:", err));
  }, 8_000);

  // Refresh every 9 minutes automatically
  setInterval(backgroundRefresh, 9 * 60 * 1000);
}

// ─── Route ────────────────────────────────────────────────────────────────────

router.get("/best-options", async (req, res) => {
  try {
    if (!TRADIER_TOKEN) {
      return res.status(503).json({ error: "Tradier API key not configured" });
    }

    const force = req.query.force === "true";

    // If cache is stale, return stale data immediately and kick off a background refresh
    const now = Date.now();
    if (cache && !force) {
      const age = now - cache.cachedAt;
      if (age > CACHE_TTL_MS && !scanInProgress) {
        backgroundRefresh();
      }
      return res.json({ ...cache.data, fromCache: true, cacheAgeMs: age });
    }

    // No cache yet or force refresh — wait for the scan (first boot scenario)
    const result = await getScanResult(force);
    res.json(result);
  } catch (err) {
    console.error("[best-options]", err);
    // Return stale cache if available rather than a hard error
    if (cache) {
      return res.json({ ...cache.data, fromCache: true, error: "Scan failed, showing last known data" });
    }
    res.status(500).json({ error: err instanceof Error ? err.message : "Scanner error" });
  }
});

// ─── SPY Options Flow route ───────────────────────────────────────────────────

interface NearAtmOption {
  strike: number;
  bid: number;
  ask: number;
  volume: number;
  openInterest: number;
}

interface OptionsFlowResponse {
  currentPrice: number;
  expiration: string;
  signal: "BUY CALL" | "BUY PUT" | "WAIT";
  signalScore: number;
  instruction: string;
  recommendedStrike: number | null;
  recommendedEntry: number | null;
  recommendedStop: number | null;
  // OI-wall based SPY price targets
  t1SpyPrice: number | null;
  t2SpyPrice: number | null;
  // Estimated option premium at those SPY levels (delta ~0.5 ATM approximation)
  t1Premium: number | null;
  t2Premium: number | null;
  nearAtmPcRatio: number;
  overallPcRatio: number;
  maxPain: number | null;
  callWall: number | null;
  putWall: number | null;
  calls: NearAtmOption[];
  puts: NearAtmOption[];
  scannedAt: string;
}

async function computeOptionsFlow(): Promise<OptionsFlowResponse> {
  // 1. Get SPY quote
  const quoteData = await tradierGet("/markets/quotes?symbols=SPY&greeks=false");
  const quote = quoteData?.quotes?.quote;
  const currentPrice: number = quote?.last ?? quote?.ask ?? 0;
  if (!currentPrice) throw new Error("Could not fetch SPY price");

  // 2. Get nearest expiration (prefer 0DTE or next day)
  const expData = await tradierGet("/markets/options/expirations?symbol=SPY&includeAllRoots=false");
  const expirations: string[] = (() => {
    const raw = expData?.expirations?.date;
    if (!raw) return [];
    return Array.isArray(raw) ? raw : [raw];
  })();
  const expiration = expirations[0] ?? null;
  if (!expiration) throw new Error("No expirations available");

  // 3. Fetch full chain
  const chain = await fetchChain("SPY", expiration);
  const calls = chain.filter(o => o.option_type === "call");
  const puts  = chain.filter(o => o.option_type === "put");

  // 4. Near-ATM 8 strikes each
  const nearest8Calls = [...calls]
    .sort((a, b) => Math.abs(a.strike - currentPrice) - Math.abs(b.strike - currentPrice))
    .slice(0, 8)
    .sort((a, b) => a.strike - b.strike);

  const nearest8Puts = [...puts]
    .sort((a, b) => Math.abs(a.strike - currentPrice) - Math.abs(b.strike - currentPrice))
    .slice(0, 8)
    .sort((a, b) => b.strike - a.strike);

  const nearCallVol = nearest8Calls.reduce((s, o) => s + (o.volume ?? 0), 0);
  const nearPutVol  = nearest8Puts.reduce((s, o) => s + (o.volume ?? 0), 0);
  const nearAtmPcRatio = nearCallVol > 0 ? nearPutVol / nearCallVol : 1;

  const totalCallVol = calls.reduce((s, o) => s + (o.volume ?? 0), 0);
  const totalPutVol  = puts.reduce((s, o) => s + (o.volume ?? 0), 0);
  const overallPcRatio = totalCallVol > 0 ? totalPutVol / totalCallVol : 1;

  // 5. Max pain
  const allStrikes = [...new Set(chain.map(o => o.strike))].sort((a, b) => a - b);
  let maxPain: number | null = null;
  let minPainVal = Infinity;
  for (const s of allStrikes) {
    const callPain = calls.reduce((sum, o) => sum + Math.max(0, s - o.strike) * (o.open_interest ?? 0), 0);
    const putPain  = puts.reduce((sum, o) => sum + Math.max(0, o.strike - s) * (o.open_interest ?? 0), 0);
    const total = callPain + putPain;
    if (total < minPainVal) { minPainVal = total; maxPain = s; }
  }

  // 6. Call wall (highest call OI) and put wall (highest put OI)
  const callWall = calls.reduce((best, o) => (!best || (o.open_interest ?? 0) > (best.open_interest ?? 0)) ? o : best, null as TradierOption | null)?.strike ?? null;
  const putWall  = puts.reduce((best, o) => (!best || (o.open_interest ?? 0) > (best.open_interest ?? 0)) ? o : best, null as TradierOption | null)?.strike ?? null;

  // 7. Signal scoring
  let score = 0;

  if (nearAtmPcRatio < 0.80) score += 2;
  else if (nearAtmPcRatio < 0.95) score += 1;
  else if (nearAtmPcRatio > 1.25) score -= 2;
  else if (nearAtmPcRatio > 1.05) score -= 1;

  if (overallPcRatio > 1.30) score -= 1;
  else if (overallPcRatio < 0.80) score += 1;

  if (maxPain !== null) {
    if (currentPrice > maxPain + 15) score -= 1;
    else if (currentPrice < maxPain - 15) score += 1;
  }
  if (callWall !== null && callWall - currentPrice < 5) score -= 1;
  if (putWall  !== null && currentPrice - putWall < 5)  score += 1;

  const signal: OptionsFlowResponse["signal"] = score >= 2 ? "BUY CALL" : score <= -2 ? "BUY PUT" : "WAIT";

  // 8. Recommended contract (ATM) + OI-wall targets
  const isCall = signal === "BUY CALL";
  const round2 = (n: number) => Math.round(n * 100) / 100;

  let recommendedStrike: number | null = null;
  let recommendedEntry: number | null = null;
  let recommendedStop: number | null = null;
  let t1SpyPrice: number | null = null;
  let t2SpyPrice: number | null = null;
  let t1Premium: number | null = null;
  let t2Premium: number | null = null;
  let instruction = "No clear edge — wait for a cleaner setup.";

  if (signal !== "WAIT") {
    const pool = isCall ? nearest8Calls : nearest8Puts;
    const atm = pool.reduce((best, o) =>
      Math.abs(o.strike - currentPrice) < Math.abs(best.strike - currentPrice) ? o : best
    , pool[0]);

    if (atm) {
      recommendedStrike = atm.strike;
      const mid = (atm.bid + atm.ask) / 2;
      recommendedEntry = round2(mid);
      recommendedStop  = round2(mid * 0.45);

      // OI-wall SPY price targets
      // CALL: T1 = callWall, T2 = callWall + (callWall - currentPrice) * 0.5 (extended move)
      // PUT:  T1 = putWall,  T2 = maxPain (gravitational pull) or putWall - 5
      if (isCall) {
        t1SpyPrice = callWall;
        t2SpyPrice = callWall !== null ? round2(callWall + (callWall - currentPrice) * 0.3) : null;
      } else {
        t1SpyPrice = putWall;
        t2SpyPrice = maxPain ?? (putWall !== null ? round2(putWall - 5) : null);
      }

      // Estimated premium at target using delta ~0.5 (ATM approximation)
      // Premium gain ≈ |SPY move| × 0.5; add to entry premium
      const DELTA = 0.5;
      if (t1SpyPrice !== null && recommendedEntry !== null) {
        const move1 = Math.abs(t1SpyPrice - currentPrice);
        t1Premium = round2(recommendedEntry + move1 * DELTA);
      }
      if (t2SpyPrice !== null && recommendedEntry !== null) {
        const move2 = Math.abs(t2SpyPrice - currentPrice);
        t2Premium = round2(recommendedEntry + move2 * DELTA);
      }

      const exp = new Date(expiration + "T00:00:00Z").toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
      const t1Str = t1SpyPrice ? ` | T1: SPY $${t1SpyPrice} (~$${t1Premium})` : "";
      instruction = `${signal}: SPY $${recommendedStrike} ${isCall ? "CALL" : "PUT"} exp ${exp} — enter ~$${recommendedEntry}, stop $${recommendedStop}${t1Str}`;
    }
  }

  const toNearAtm = (o: TradierOption): NearAtmOption => ({
    strike: o.strike,
    bid: o.bid ?? 0,
    ask: o.ask ?? 0,
    volume: o.volume ?? 0,
    openInterest: o.open_interest ?? 0,
  });

  return {
    currentPrice,
    expiration,
    signal,
    signalScore: score,
    instruction,
    recommendedStrike,
    recommendedEntry,
    recommendedStop,
    t1SpyPrice,
    t2SpyPrice,
    t1Premium,
    t2Premium,
    nearAtmPcRatio: Math.round(nearAtmPcRatio * 100) / 100,
    overallPcRatio: Math.round(overallPcRatio * 100) / 100,
    maxPain,
    callWall,
    putWall,
    calls: nearest8Calls.map(toNearAtm),
    puts: nearest8Puts.map(toNearAtm),
    scannedAt: new Date().toISOString(),
  };
}

router.get("/spy/options-flow", async (_req, res) => {
  try {
    if (!TRADIER_TOKEN) return res.status(503).json({ error: "TRADIER_API_KEY not configured" });
    const data = await computeOptionsFlow();
    res.json(data);
  } catch (err) {
    console.error("[options-flow]", err);
    res.status(500).json({ error: err instanceof Error ? err.message : "Options flow error" });
  }
});

export default router;
