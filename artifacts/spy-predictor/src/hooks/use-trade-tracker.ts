import { useEffect, useRef, useCallback } from "react";

export type TradeOutcome = "T1" | "T2" | "SL" | "open";
export type TradeMode = "intraday" | "swing" | "best";

export interface TradeRecord {
  id: string;
  mode: TradeMode;
  signal: "CALL" | "PUT";
  outcome: TradeOutcome;
  ts: string;
}

const STORAGE_KEY = "spy_trade_log_v1";
const OUTCOME_PRIORITY: Record<TradeOutcome, number> = { T2: 4, T1: 3, SL: 1, open: 0 };

function loadAll(): TradeRecord[] {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]"); }
  catch { return []; }
}

function saveAll(records: TradeRecord[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(records.slice(-500)));
}

export function computeTargetStatus(
  side: "CALL" | "PUT",
  currentPrice: number,
  underlyingEntry: number,
  underlyingT1: number,
  underlyingT2: number,
  underlyingStop: number,
): { t1Hit: boolean; t2Hit: boolean; slHit: boolean; activeTarget: TradeOutcome } {
  const isCall = side === "CALL";
  const t1Hit = isCall ? currentPrice >= underlyingT1 : currentPrice <= underlyingT1;
  const t2Hit = isCall ? currentPrice >= underlyingT2 : currentPrice <= underlyingT2;
  const slHit = isCall ? currentPrice <= underlyingStop : currentPrice >= underlyingStop;

  let activeTarget: TradeOutcome = "open";
  if (t2Hit)      activeTarget = "T2";
  else if (t1Hit) activeTarget = "T1";
  else if (slHit) activeTarget = "SL";

  return { t1Hit, t2Hit, slHit, activeTarget };
}

export function getScoreCounts(mode: TradeMode): { wins: number; losses: number; total: number; winRate: number } {
  const records = loadAll().filter(r => r.mode === mode && r.outcome !== "open");
  const wins    = records.filter(r => r.outcome === "T1" || r.outcome === "T2").length;
  const losses  = records.filter(r => r.outcome === "SL").length;
  const total   = wins + losses;
  return { wins, losses, total, winRate: total > 0 ? Math.round((wins / total) * 100) : 0 };
}

export function getAllScores() {
  return {
    intraday: getScoreCounts("intraday"),
    swing:    getScoreCounts("swing"),
    best:     getScoreCounts("best"),
  };
}

export function clearScores() {
  localStorage.removeItem(STORAGE_KEY);
}

export function recordManualOutcome(mode: TradeMode, signal: "CALL" | "PUT", outcome: "T1" | "T2" | "SL") {
  const all = loadAll();
  all.push({ id: `${mode}_manual_${Date.now()}`, mode, signal, outcome, ts: new Date().toISOString() });
  saveAll(all);
}

function tryRecord(id: string, mode: TradeMode, signal: "CALL" | "PUT", outcome: TradeOutcome) {
  if (outcome === "open") return false;
  const all = loadAll();
  const existing = all.find(r => r.id === id);
  if (existing) {
    if (OUTCOME_PRIORITY[outcome] > OUTCOME_PRIORITY[existing.outcome]) {
      existing.outcome = outcome;
      saveAll(all);
      return true;
    }
    return false;
  } else {
    all.push({ id, mode, signal, outcome, ts: new Date().toISOString() });
    saveAll(all);
    return true;
  }
}

interface PrevSnapshot {
  ts: string;
  side: "CALL" | "PUT";
  entry: number;
  t1: number;
  t2: number;
  stop: number;
}

/**
 * Auto-tracks intraday/swing signal outcomes.
 *
 * Strategy:
 *  1. Each signal has its own trade ID (full timestamp = one record per ~5-min bar).
 *  2. Every minute when currentPrice updates, compare CURRENT price vs CURRENT targets.
 *  3. When a NEW signal arrives (new timestamp), also evaluate the PREVIOUS signal's
 *     levels against the current price — this catches targets hit in the gap between
 *     the old signal's last check and the new signal arriving.
 */
export function useAutoTrackSignal(mode: "intraday" | "swing", signal: any) {
  const prevRef = useRef<PrevSnapshot | null>(null);

  useEffect(() => {
    if (!signal?.trade || !signal.timestamp || signal.signal === "WAIT") return;

    const trade        = signal.trade;
    const currentPrice = signal.currentPrice as number;
    const ts           = signal.timestamp as string;

    const prev = prevRef.current;

    // ── Step 1: New signal arrived → close out the PREVIOUS signal ──────────
    // By checking the previous signal's targets against TODAY's current price,
    // we catch any targets that were crossed between the last 1-minute check
    // and when the new 5-min bar triggered a new signal.
    if (prev && prev.ts !== ts) {
      const { activeTarget: prevOutcome } = computeTargetStatus(
        prev.side, currentPrice, prev.entry, prev.t1, prev.t2, prev.stop,
      );
      // Only record if outcome was determined (don't record "open" for old signals)
      if (prevOutcome !== "open") {
        tryRecord(`${mode}_${prev.ts}`, mode, prev.side, prevOutcome);
      }
    }

    // ── Step 2: Evaluate CURRENT signal at current price ────────────────────
    const { activeTarget: currOutcome } = computeTargetStatus(
      trade.side, currentPrice,
      trade.underlyingEntry, trade.underlyingT1, trade.underlyingT2, trade.underlyingStop,
    );
    if (currOutcome !== "open") {
      tryRecord(`${mode}_${ts}`, mode, trade.side, currOutcome);
    }

    // ── Step 3: Save current signal as "previous" for next cycle ────────────
    prevRef.current = {
      ts,
      side:  trade.side,
      entry: trade.underlyingEntry,
      t1:    trade.underlyingT1,
      t2:    trade.underlyingT2,
      stop:  trade.underlyingStop,
    };
  }, [signal?.timestamp, signal?.currentPrice, mode]);
}

export function useScoreboard() {
  const getScores = useCallback(() => getAllScores(), []);
  const recordBestOptions = useCallback(
    (signal: "CALL" | "PUT", outcome: "T1" | "T2" | "SL") => recordManualOutcome("best", signal, outcome),
    [],
  );
  const reset = useCallback(() => clearScores(), []);
  return { getScores, recordBestOptions, reset };
}
