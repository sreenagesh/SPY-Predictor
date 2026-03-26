import { useEffect, useCallback } from "react";

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
  if (t2Hit) activeTarget = "T2";
  else if (t1Hit) activeTarget = "T1";
  else if (slHit) activeTarget = "SL";

  return { t1Hit, t2Hit, slHit, activeTarget };
}

export function getScoreCounts(mode: TradeMode): { wins: number; losses: number; total: number; winRate: number } {
  const records = loadAll().filter(r => r.mode === mode && r.outcome !== "open");
  const wins = records.filter(r => r.outcome === "T1" || r.outcome === "T2").length;
  const losses = records.filter(r => r.outcome === "SL").length;
  const total = wins + losses;
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
  if (outcome === "open") return;
  const all = loadAll();
  const existing = all.find(r => r.id === id);
  if (existing) {
    if (OUTCOME_PRIORITY[outcome] > OUTCOME_PRIORITY[existing.outcome]) {
      existing.outcome = outcome;
      saveAll(all);
    }
  } else {
    all.push({ id, mode, signal, outcome, ts: new Date().toISOString() });
    saveAll(all);
  }
}

export function useAutoTrackSignal(
  mode: "intraday" | "swing",
  signal: any,
) {
  useEffect(() => {
    if (!signal?.trade || !signal.timestamp || signal.signal === "WAIT") return;
    const trade = signal.trade;
    const { activeTarget } = computeTargetStatus(
      trade.side,
      signal.currentPrice,
      trade.underlyingEntry,
      trade.underlyingT1,
      trade.underlyingT2,
      trade.underlyingStop,
    );
    if (activeTarget === "open") return;
    const tradeId = `${mode}_${signal.timestamp.slice(0, 13)}`;
    tryRecord(tradeId, mode, trade.side, activeTarget);
  }, [signal?.currentPrice, mode]);
}

export function useScoreboard() {
  const getScores = useCallback(() => getAllScores(), []);

  const recordBestOptions = useCallback((signal: "CALL" | "PUT", outcome: "T1" | "T2" | "SL") => {
    recordManualOutcome("best", signal, outcome);
  }, []);

  const reset = useCallback(() => clearScores(), []);

  return { getScores, recordBestOptions, reset };
}
