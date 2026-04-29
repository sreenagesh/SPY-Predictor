import { Router } from "express";
import {
  tradierGet,
  fetchExpirations,
  fetchChain,
  type TradierOption,
} from "../lib/tradier.js";

const router = Router();

// ── Time helper ───────────────────────────────────────────────────────────────

function isAfter330pmET(): boolean {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    hour: "numeric",
    minute: "numeric",
    hour12: false,
  }).formatToParts(new Date());
  const hour = parseInt(parts.find((p) => p.type === "hour")?.value ?? "0");
  const min = parseInt(parts.find((p) => p.type === "minute")?.value ?? "0");
  return hour > 15 || (hour === 15 && min >= 30);
}

// ── Guidance text builder ─────────────────────────────────────────────────────

function computeGuidance(
  currentPrice: number,
  totalGex: number,
  gammaFlip: number | null,
  callWall: number | null,
  putWall: number | null,
  maxPain: number | null,
  regime: "0dte" | "1dte",
): { guidance: string; guidanceBias: "bull" | "bear" | "neutral" } {
  const parts: string[] = [];
  let guidanceBias: "bull" | "bear" | "neutral" = "neutral";

  const absGexB = Math.abs(totalGex / 1_000_000_000);
  const absGexM = Math.abs(totalGex / 1_000_000);
  const gexLabel =
    absGexB >= 1
      ? `$${absGexB.toFixed(1)}B`
      : `$${absGexM.toFixed(0)}M`;

  // 1. Regime note
  if (regime === "1dte") {
    parts.push("⏱ Next-session setup (after 3:30 PM ET).");
  }

  // 2. Gamma regime
  if (totalGex > 0) {
    parts.push(
      `Positive gamma regime (${gexLabel}) — dealers are net long gamma, which stabilizes price. Expect mean-reversion and range-bound conditions. Scalp between Put Wall and Call Wall rather than trending trades.`,
    );
  } else {
    parts.push(
      `Negative gamma regime (${gexLabel}) — dealers are net short gamma, which amplifies moves. Directional breakouts and larger intraday swings are more likely. Avoid selling premium naked; prefer defined-risk debit spreads.`,
    );
  }

  // 3. Price vs gamma flip
  if (gammaFlip !== null) {
    const above = currentPrice >= gammaFlip;
    const dist = Math.abs(currentPrice - gammaFlip).toFixed(2);
    if (above) {
      parts.push(
        `Price ($${currentPrice.toFixed(2)}) is ABOVE gamma flip ($${gammaFlip}) by $${dist} — bullish gamma cushion. Dips toward $${gammaFlip} are high-probability buy-the-dip zones for 0DTE calls. A break below $${gammaFlip} would shift to negative gamma and accelerate downside.`,
      );
      guidanceBias = "bull";
    } else {
      parts.push(
        `Price ($${currentPrice.toFixed(2)}) is BELOW gamma flip ($${gammaFlip}) by $${dist} — negative gamma territory. Downside moves can accelerate as dealers are forced to sell into weakness. 0DTE puts have structural tailwind; any rally above $${gammaFlip} flips back to positive gamma support.`,
      );
      guidanceBias = "bear";
    }
  }

  // 4. Call wall — dealer resistance
  if (callWall !== null) {
    const distUp = callWall - currentPrice;
    if (distUp > 0 && distUp <= 10) {
      parts.push(
        `Call Wall at $${callWall} (+$${distUp.toFixed(2)}) is nearby — strong dealer resistance ceiling. Avoid chasing calls above this level; consider put spreads if price stalls here.`,
      );
    } else if (distUp <= 0) {
      parts.push(
        `Price has broken through Call Wall $${callWall} — bullish breakout signal. Call walls can flip to support; consider adding to longs on any retest from above.`,
      );
      if (guidanceBias === "neutral") guidanceBias = "bull";
    }
  }

  // 5. Put wall — dealer support
  if (putWall !== null) {
    const distDown = currentPrice - putWall;
    if (distDown > 0 && distDown <= 10) {
      parts.push(
        `Put Wall at $${putWall} (-$${distDown.toFixed(2)}) is nearby — dealer support floor. This is a high-probability entry zone for 0DTE calls on a bounce off $${putWall}.`,
      );
      if (guidanceBias === "neutral") guidanceBias = "bull";
    } else if (distDown <= 0) {
      parts.push(
        `Price has broken through Put Wall $${putWall} — bearish signal. Dealer hedging can accelerate the drop; look for the next lower support before entering puts.`,
      );
      if (guidanceBias === "neutral") guidanceBias = "bear";
    }
  }

  // 6. Max pain gravitational pull
  if (maxPain !== null) {
    const dist = maxPain - currentPrice;
    if (Math.abs(dist) >= 1) {
      const dir = dist > 0 ? "higher" : "lower";
      parts.push(
        `Max Pain $${maxPain} pulls price $${Math.abs(dist).toFixed(2)} ${dir} into the close — late-session gravitational effect. Watch for pinning action in the final 30 minutes.`,
      );
    } else {
      parts.push(
        `Price pinned at Max Pain $${maxPain} — minimal late-session directional edge from options structure.`,
      );
    }
  }

  return { guidance: parts.join(" "), guidanceBias };
}

// ── Core GEX calculation ──────────────────────────────────────────────────────

interface PerStrikeGex {
  strike: number;
  netGex: number;
  callGex: number;
  putGex: number;
  callOi: number;
  putOi: number;
}

interface GexResult {
  totalGex: number;
  gammaFlip: number | null;
  isFlipEstimated: boolean;
  currentPrice: number;
  expiration: string;
  regime: "0dte" | "1dte";
  aboveFlip: boolean;
  callWall: number | null;
  putWall: number | null;
  maxPain: number | null;
  perStrike: PerStrikeGex[];
  guidance: string;
  guidanceBias: "bull" | "bear" | "neutral";
  scannedAt: string;
}

async function computeGex(): Promise<GexResult> {
  // 1. SPY current price
  const quoteData = await tradierGet("/markets/quotes?symbols=SPY&greeks=false");
  const quote = quoteData?.quotes?.quote;
  const currentPrice: number = quote?.last ?? quote?.ask ?? 0;
  if (!currentPrice) throw new Error("Could not fetch SPY price");

  // 2. Expirations — pick 0DTE before 3:30 PM, next expiry after
  const expirations = await fetchExpirations("SPY");
  if (!expirations.length) throw new Error("No expirations available");

  const useNext = isAfter330pmET();
  const expiration = useNext ? (expirations[1] ?? expirations[0]) : expirations[0];
  const regime: "0dte" | "1dte" = useNext ? "1dte" : "0dte";

  // 3. Full chain with greeks
  const chain = await fetchChain("SPY", expiration);
  const calls = chain.filter((o) => o.option_type === "call");
  const puts  = chain.filter((o) => o.option_type === "put");

  // 4. Per-strike GEX
  // Formula: GEX = gamma × OI × 100 × spot
  // Calls contribute positive GEX (dealers are short → stabilizing on upside)
  // Puts contribute negative GEX (dealers are short → stabilizing on downside)
  const strikeMap = new Map<
    number,
    { callGex: number; putGex: number; callOi: number; putOi: number }
  >();

  for (const opt of calls) {
    if (!opt.greeks?.gamma || opt.strike == null) continue;
    const gex = opt.greeks.gamma * (opt.open_interest ?? 0) * 100 * currentPrice;
    const cur = strikeMap.get(opt.strike) ?? { callGex: 0, putGex: 0, callOi: 0, putOi: 0 };
    cur.callGex += gex;
    cur.callOi  += opt.open_interest ?? 0;
    strikeMap.set(opt.strike, cur);
  }

  for (const opt of puts) {
    if (!opt.greeks?.gamma || opt.strike == null) continue;
    const gex = opt.greeks.gamma * (opt.open_interest ?? 0) * 100 * currentPrice;
    const cur = strikeMap.get(opt.strike) ?? { callGex: 0, putGex: 0, callOi: 0, putOi: 0 };
    cur.putGex += gex;
    cur.putOi  += opt.open_interest ?? 0;
    strikeMap.set(opt.strike, cur);
  }

  // Build sorted array (high → low strike)
  const perStrikeAll: PerStrikeGex[] = Array.from(strikeMap.entries())
    .map(([strike, d]) => ({
      strike,
      netGex:  Math.round(d.callGex - d.putGex),
      callGex: Math.round(d.callGex),
      putGex:  Math.round(d.putGex),
      callOi:  d.callOi,
      putOi:   d.putOi,
    }))
    .sort((a, b) => b.strike - a.strike);

  // 5. Total GEX
  const totalGex = perStrikeAll.reduce((sum, s) => sum + s.netGex, 0);

  // 6. Gamma Flip — sweep high→low, find where cumulative GEX crosses zero.
  // Fallback: if no exact crossing exists, use the strike where cumulative GEX
  // is closest to zero (nearest-approach estimate).
  let cumGex = 0;
  let gammaFlip: number | null = null;
  let isFlipEstimated = false;
  for (const s of perStrikeAll) {
    const prev = cumGex;
    cumGex += s.netGex;
    if ((prev > 0 && cumGex <= 0) || (prev < 0 && cumGex >= 0)) {
      gammaFlip = s.strike;
      break;
    }
  }
  if (gammaFlip === null && perStrikeAll.length > 0) {
    let runningCum = 0;
    let closestDist = Infinity;
    for (const s of perStrikeAll) {
      runningCum += s.netGex;
      const dist = Math.abs(runningCum);
      if (dist < closestDist) {
        closestDist = dist;
        gammaFlip = s.strike;
      }
    }
    isFlipEstimated = true;
  }

  // 7. Call Wall (highest call OI)
  const callWallOpt = calls.reduce<TradierOption | null>(
    (best, o) =>
      !best || (o.open_interest ?? 0) > (best.open_interest ?? 0) ? o : best,
    null,
  );
  const callWall = callWallOpt?.strike ?? null;

  // 8. Put Wall (highest put OI)
  const putWallOpt = puts.reduce<TradierOption | null>(
    (best, o) =>
      !best || (o.open_interest ?? 0) > (best.open_interest ?? 0) ? o : best,
    null,
  );
  const putWall = putWallOpt?.strike ?? null;

  // 9. Max Pain
  const allStrikes = [...new Set(chain.map((o) => o.strike))].sort((a, b) => a - b);
  let maxPain: number | null = null;
  let minPainVal = Infinity;
  for (const s of allStrikes) {
    const callPain = calls.reduce(
      (sum, o) => sum + Math.max(0, s - o.strike) * (o.open_interest ?? 0),
      0,
    );
    const putPain = puts.reduce(
      (sum, o) => sum + Math.max(0, o.strike - s) * (o.open_interest ?? 0),
      0,
    );
    const total = callPain + putPain;
    if (total < minPainVal) { minPainVal = total; maxPain = s; }
  }

  // 10. Guidance
  const { guidance, guidanceBias } = computeGuidance(
    currentPrice,
    totalGex,
    gammaFlip,
    callWall,
    putWall,
    maxPain,
    regime,
  );

  // Limit perStrike payload to ±$25 around spot (keeps response small)
  const perStrike = perStrikeAll.filter(
    (s) => Math.abs(s.strike - currentPrice) <= 25,
  );

  return {
    totalGex,
    gammaFlip,
    isFlipEstimated,
    currentPrice,
    expiration,
    regime,
    aboveFlip: gammaFlip !== null ? currentPrice >= gammaFlip : true,
    callWall,
    putWall,
    maxPain,
    perStrike,
    guidance,
    guidanceBias,
    scannedAt: new Date().toISOString(),
  };
}

// ── Route ─────────────────────────────────────────────────────────────────────

router.get("/spy/gex", async (_req, res) => {
  try {
    if (!process.env.TRADIER_API_KEY) {
      return res.status(503).json({ error: "TRADIER_API_KEY not configured" });
    }
    const data = await computeGex();
    return res.json(data);
  } catch (err) {
    console.error("[gex]", err);
    return res
      .status(500)
      .json({ error: err instanceof Error ? err.message : "GEX error" });
  }
});

export default router;
