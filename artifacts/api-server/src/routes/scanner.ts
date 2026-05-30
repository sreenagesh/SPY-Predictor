import { Router } from "express";

const router = Router();

// ─── Large/Mega cap universe (~100 tickers) ────────────────────────────────
const UNIVERSE = [
  "AAPL","MSFT","NVDA","AMZN","GOOGL","META","TSLA","BRK.B","JPM","LLY",
  "V","UNH","XOM","WMT","JNJ","MA","AVGO","PG","HD","COST",
  "MRK","ABBV","CVX","KO","PEP","ADBE","CRM","TMO","ACN","MCD",
  "CSCO","AMD","NFLX","LIN","TXN","WFC","PM","DHR","AMGN","NEE",
  "INTU","RTX","QCOM","SPGI","CAT","ISRG","BKNG","GS","BA","UBER",
  "NOW","T","VZ","MS","AXP","IBM","BLK","DE","GE","SYK",
  "GILD","ELV","PLD","MDLZ","ADI","REGN","MMC","VRTX","MO","C",
  "CI","PGR","ETN","SCHW","ZTS","BSX","TJX","CB","SO","DUK",
  "CL","AON","BDX","CME","ITW","EQIX","PH","NOC","EMR","HCA",
  "LRCX","KKR","SHW","TGT","FI","MCO","APH","ORLY","PANW","KLAC",
];

// ─── Indicator math ────────────────────────────────────────────────────────

function calcRSI(closes: number[], period = 14): number {
  if (closes.length < period + 1) return 50;
  let gains = 0, losses = 0;
  for (let i = closes.length - period; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff > 0) gains += diff; else losses -= diff;
  }
  const avgGain = gains / period;
  const avgLoss = losses / period;
  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - 100 / (1 + rs);
}

function ema(values: number[], period: number): number[] {
  const k = 2 / (period + 1);
  const result: number[] = [];
  let prev = values.slice(0, period).reduce((a, b) => a + b, 0) / period;
  result.push(...new Array(period - 1).fill(NaN));
  result.push(prev);
  for (let i = period; i < values.length; i++) {
    prev = values[i] * k + prev * (1 - k);
    result.push(prev);
  }
  return result;
}

function calcMACD(closes: number[]) {
  const fast = ema(closes, 12);
  const slow = ema(closes, 26);
  const macdLine = fast.map((f, i) => (isNaN(f) || isNaN(slow[i])) ? NaN : f - slow[i]);
  const validMacd = macdLine.filter(v => !isNaN(v));
  const signalLine = ema(validMacd, 9);
  // realign signal to full length
  const offset = macdLine.findIndex(v => !isNaN(v));
  const histFull: number[] = macdLine.map((m, i) => {
    const si = i - offset - (validMacd.length - signalLine.length);
    if (isNaN(m) || si < 0 || isNaN(signalLine[si])) return NaN;
    return m - signalLine[si];
  });
  return histFull;
}

// ─── Cache ─────────────────────────────────────────────────────────────────
const CACHE_TTL_MS = 15 * 60 * 1000;
let cache: { ts: number; data: ScannerResponse } | null = null;

export interface ScannerStock {
  ticker: string;
  price: number;
  priceChangePct: number;
  rsi: number;
  macdHist: number;
  macdHistPrev: number;
  volumeRatio: number; // today vol / 20d avg vol
  signal: "breakout" | "breakdown";
  strength: number; // 1-4 signals passing
}

export interface ScannerResponse {
  breakouts: ScannerStock[];
  breakdowns: ScannerStock[];
  scannedAt: string;
  totalScanned: number;
}

// ─── Tradier history fetch ─────────────────────────────────────────────────
async function fetchHistory(symbol: string): Promise<{ date: string; close: number; volume: number }[]> {
  const token = process.env.TRADIER_API_KEY;
  if (!token) return [];
  const end = new Date().toISOString().slice(0, 10);
  const start = new Date(Date.now() - 60 * 24 * 3600 * 1000).toISOString().slice(0, 10);
  try {
    const res = await fetch(
      `https://api.tradier.com/v1/markets/history?symbol=${symbol}&interval=daily&start=${start}&end=${end}`,
      { headers: { Authorization: `Bearer ${token}`, Accept: "application/json" } }
    );
    if (!res.ok) return [];
    const json = await res.json();
    const days = json?.history?.day;
    if (!days) return [];
    const arr = Array.isArray(days) ? days : [days];
    return arr.map((d: any) => ({ date: d.date, close: d.close, volume: d.volume }));
  } catch {
    return [];
  }
}

// ─── Analyze single ticker ─────────────────────────────────────────────────
async function analyzeTicker(symbol: string): Promise<ScannerStock | null> {
  const bars = await fetchHistory(symbol);
  if (bars.length < 30) return null;

  const closes = bars.map(b => b.close);
  const volumes = bars.map(b => b.volume);
  const n = closes.length;

  const price = closes[n - 1];
  const prevClose = closes[n - 2];
  const priceChangePct = ((price - prevClose) / prevClose) * 100;

  // Volume ratio: today vs 20-day avg (excluding today)
  const vol20avg = volumes.slice(n - 21, n - 1).reduce((a, b) => a + b, 0) / 20;
  const volumeRatio = vol20avg > 0 ? volumes[n - 1] / vol20avg : 1;

  // RSI
  const rsi = calcRSI(closes);
  const rsiPrev = calcRSI(closes.slice(0, -1));

  // MACD histogram
  const hist = calcMACD(closes);
  const macdHist = hist[n - 1];
  const macdHistPrev = hist[n - 2];
  if (isNaN(macdHist) || isNaN(macdHistPrev)) return null;

  // 20-day high/low (excluding today)
  const prior20Closes = closes.slice(n - 21, n - 1);
  const high20 = Math.max(...prior20Closes);
  const low20 = Math.min(...prior20Closes);

  // ── Breakout scoring ──
  const volUp = volumeRatio >= 1.3;
  const priceUp = priceChangePct > 0;
  const rsiUp = rsi > 50 && rsiPrev <= 52; // RSI crossing/just above 50
  const macdUp = macdHist > macdHistPrev;
  const breakoutCandle = price > high20;

  // ── Breakdown scoring ──
  const priceDown = priceChangePct < 0;
  const rsiDown = rsi < 50 && rsiPrev >= 48;
  const macdDown = macdHist < macdHistPrev;
  const breakdownCandle = price < low20;

  const breakoutScore = [volUp && priceUp, rsiUp, macdUp, breakoutCandle].filter(Boolean).length;
  const breakdownScore = [volUp && priceDown, rsiDown, macdDown, breakdownCandle].filter(Boolean).length;

  if (breakoutScore >= 3) {
    return { ticker: symbol, price, priceChangePct, rsi, macdHist, macdHistPrev, volumeRatio, signal: "breakout", strength: breakoutScore };
  }
  if (breakdownScore >= 3) {
    return { ticker: symbol, price, priceChangePct, rsi, macdHist, macdHistPrev, volumeRatio, signal: "breakdown", strength: breakdownScore };
  }
  return null;
}

// ─── Run scan ──────────────────────────────────────────────────────────────
async function runScan(): Promise<ScannerResponse> {
  // Batch requests in groups of 10 to avoid rate limits
  const results: ScannerStock[] = [];
  const batchSize = 10;
  for (let i = 0; i < UNIVERSE.length; i += batchSize) {
    const batch = UNIVERSE.slice(i, i + batchSize);
    const batchResults = await Promise.all(batch.map(t => analyzeTicker(t)));
    batchResults.forEach(r => { if (r) results.push(r); });
  }

  const breakouts = results.filter(r => r.signal === "breakout").sort((a, b) => b.strength - a.strength || b.volumeRatio - a.volumeRatio);
  const breakdowns = results.filter(r => r.signal === "breakdown").sort((a, b) => b.strength - a.strength || b.volumeRatio - a.volumeRatio);

  return { breakouts, breakdowns, scannedAt: new Date().toISOString(), totalScanned: UNIVERSE.length };
}

// ─── Route ─────────────────────────────────────────────────────────────────
router.get("/scanner", async (_req, res) => {
  try {
    const now = Date.now();
    if (cache && now - cache.ts < CACHE_TTL_MS) {
      return res.json(cache.data);
    }
    const data = await runScan();
    cache = { ts: now, data };
    res.json(data);
  } catch (err: any) {
    res.status(500).json({ error: err.message ?? "Scanner failed" });
  }
});

export default router;
