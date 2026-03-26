import React, { useState, useEffect } from "react";
import { motion } from "framer-motion";
import {
  Download, Trash2, Trophy, CheckCircle2, XCircle,
  Zap, TrendingUp, BarChart3, Filter,
} from "lucide-react";
import { getAllScores, clearScores, type TradeRecord, type TradeMode } from "@/hooks/use-trade-tracker";
import { cn } from "@/lib/utils";

const STORAGE_KEY = "spy_trade_log_v1";

function loadAll(): TradeRecord[] {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]"); }
  catch { return []; }
}

// ─── Formatting helpers ────────────────────────────────────────────────────────

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
}

// ─── Small badge chips ────────────────────────────────────────────────────────

function ModeBadge({ mode }: { mode: TradeMode }) {
  const cfg = {
    intraday: { label: "INTRADAY", cls: "bg-blue-500/15 text-blue-400 border-blue-500/25",  icon: Zap },
    swing:    { label: "SWING",    cls: "bg-purple-500/15 text-purple-400 border-purple-500/25", icon: TrendingUp },
    best:     { label: "BEST OPT", cls: "bg-yellow-500/15 text-yellow-400 border-yellow-500/25", icon: Trophy },
  }[mode];
  const Icon = cfg.icon;
  return (
    <span className={cn("inline-flex items-center gap-1 px-2 py-0.5 rounded-md border text-[10px] font-bold", cfg.cls)}>
      <Icon className="w-2.5 h-2.5" />{cfg.label}
    </span>
  );
}

function DirectionBadge({ dir }: { dir: "CALL" | "PUT" }) {
  return (
    <span className={cn(
      "inline-flex px-2 py-0.5 rounded-md text-[10px] font-black border",
      dir === "CALL"
        ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/25"
        : "bg-red-500/15 text-red-400 border-red-500/25",
    )}>{dir}</span>
  );
}

function OutcomeBadge({ outcome }: { outcome: string }) {
  if (outcome === "T2") return (
    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-yellow-500/15 text-yellow-400 border border-yellow-500/25 text-[11px] font-black">
      <Trophy className="w-3 h-3" /> T2 HIT
    </span>
  );
  if (outcome === "T1") return (
    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-500/15 text-emerald-400 border border-emerald-500/25 text-[11px] font-black">
      <CheckCircle2 className="w-3 h-3" /> T1 HIT
    </span>
  );
  if (outcome === "SL") return (
    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-red-500/15 text-red-400 border border-red-500/25 text-[11px] font-black">
      <XCircle className="w-3 h-3" /> SL HIT
    </span>
  );
  return (
    <span className="inline-flex px-2.5 py-1 rounded-lg bg-white/5 text-muted-foreground border border-white/10 text-[11px] font-semibold">
      OPEN
    </span>
  );
}

// ─── Summary stat card ────────────────────────────────────────────────────────

function StatCard({ label, value, sub, color }: { label: string; value: string | number; sub?: string; color?: string }) {
  return (
    <div className="glass-panel rounded-xl px-4 py-3 flex flex-col gap-0.5">
      <span className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest">{label}</span>
      <span className={cn("text-2xl font-black font-mono leading-none", color ?? "text-foreground")}>{value}</span>
      {sub && <span className="text-[10px] text-muted-foreground mt-0.5">{sub}</span>}
    </div>
  );
}

// ─── CSV export ───────────────────────────────────────────────────────────────

function exportCSV(records: TradeRecord[]) {
  const header = "Date,Time,Mode,Direction,Outcome,Result\n";
  const rows = records.map(r => {
    const d    = fmtDate(r.ts);
    const t    = fmtTime(r.ts);
    const mode = r.mode === "intraday" ? "Intraday" : r.mode === "swing" ? "Swing/BTST" : "Best Options";
    const res  = r.outcome === "T1" || r.outcome === "T2" ? "Win" : r.outcome === "SL" ? "Loss" : "Open";
    return `"${d}","${t}","${mode}","${r.signal}","${r.outcome}","${res}"`;
  }).join("\n");
  const blob = new Blob([header + rows], { type: "text/csv;charset=utf-8;" });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href     = url;
  a.download = `spy_trade_history_${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// ─── Main History page ────────────────────────────────────────────────────────

type FilterMode = "all" | TradeMode;

const FILTER_TABS: { key: FilterMode; label: string; icon: React.ElementType }[] = [
  { key: "all",      label: "All",          icon: BarChart3 },
  { key: "intraday", label: "Intraday",     icon: Zap },
  { key: "swing",    label: "Swing / BTST", icon: TrendingUp },
  { key: "best",     label: "Best Options", icon: Trophy },
];

export default function History() {
  const [records, setRecords]   = useState<TradeRecord[]>([]);
  const [filter, setFilter]     = useState<FilterMode>("all");
  const [showConfirm, setShowConfirm] = useState(false);

  const reload = () => setRecords(loadAll().slice().reverse()); // newest first
  useEffect(() => { reload(); }, []);

  const scores     = getAllScores();
  const allWins    = scores.intraday.wins   + scores.swing.wins   + scores.best.wins;
  const allLosses  = scores.intraday.losses + scores.swing.losses + scores.best.losses;
  const allTotal   = allWins + allLosses;
  const allWinRate = allTotal > 0 ? Math.round((allWins / allTotal) * 100) : 0;

  const filtered = filter === "all"
    ? records.filter(r => r.outcome !== "open")
    : records.filter(r => r.mode === filter && r.outcome !== "open");

  const handleClear = () => {
    clearScores();
    setShowConfirm(false);
    reload();
  };

  return (
    <div className="space-y-5">
      {/* Page title */}
      <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}>
        <h2 className="text-2xl font-black tracking-tight">Trade History</h2>
        <p className="text-sm text-muted-foreground mt-0.5">All recorded wins and losses, auto-tracked from live signals</p>
      </motion.div>

      {/* Summary row */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.05 }}
        className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3"
      >
        <StatCard label="Total Trades" value={allTotal} />
        <StatCard label="Overall Wins"   value={allWins}    color="text-emerald-400" />
        <StatCard label="Overall Losses" value={allLosses}  color="text-red-400" />
        <StatCard label="Win Rate"       value={allTotal > 0 ? `${allWinRate}%` : "—"} color={allWinRate >= 60 ? "text-emerald-400" : allWinRate >= 40 ? "text-amber-400" : "text-muted-foreground"} />
        <StatCard label="Intraday"  value={`${scores.intraday.wins}W / ${scores.intraday.losses}L`}  sub={scores.intraday.total > 0 ? `${scores.intraday.winRate}% win` : undefined} />
        <StatCard label="Swing"     value={`${scores.swing.wins}W / ${scores.swing.losses}L`}         sub={scores.swing.total > 0 ? `${scores.swing.winRate}% win` : undefined} />
        <StatCard label="Best Opt." value={`${scores.best.wins}W / ${scores.best.losses}L`}           sub={scores.best.total > 0 ? `${scores.best.winRate}% win` : undefined} />
      </motion.div>

      {/* Filter + action bar */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.1 }}
        className="flex items-center justify-between flex-wrap gap-3"
      >
        {/* Filter tabs */}
        <div className="flex items-center gap-1 p-1 bg-secondary/40 rounded-xl">
          {FILTER_TABS.map(tab => {
            const Icon = tab.icon;
            const isActive = filter === tab.key;
            return (
              <button
                key={tab.key}
                onClick={() => setFilter(tab.key)}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all duration-200",
                  isActive
                    ? "bg-primary text-primary-foreground shadow-lg shadow-primary/20"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                <Icon className="w-3.5 h-3.5" />
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => exportCSV(filtered.length > 0 ? filtered : records.filter(r => r.outcome !== "open"))}
            disabled={allTotal === 0}
            className={cn(
              "flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold border transition-all duration-200",
              allTotal > 0
                ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/20"
                : "bg-white/3 border-white/10 text-muted-foreground/40 cursor-not-allowed",
            )}
          >
            <Download className="w-3.5 h-3.5" />
            Export CSV
          </button>

          {!showConfirm ? (
            <button
              onClick={() => setShowConfirm(true)}
              disabled={allTotal === 0}
              className={cn(
                "flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold border transition-all duration-200",
                allTotal > 0
                  ? "bg-red-500/10 border-red-500/30 text-red-400 hover:bg-red-500/20"
                  : "bg-white/3 border-white/10 text-muted-foreground/40 cursor-not-allowed",
              )}
            >
              <Trash2 className="w-3.5 h-3.5" />
              Clear All
            </button>
          ) : (
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-muted-foreground">Sure?</span>
              <button onClick={handleClear}
                className="px-3 py-1.5 rounded-lg bg-red-500/20 border border-red-500/30 text-red-400 text-xs font-bold hover:bg-red-500/30 transition-colors">
                Yes, clear
              </button>
              <button onClick={() => setShowConfirm(false)}
                className="px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-muted-foreground text-xs font-semibold hover:bg-white/10 transition-colors">
                Cancel
              </button>
            </div>
          )}
        </div>
      </motion.div>

      {/* Table */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.15 }}
        className="glass-panel rounded-2xl overflow-hidden"
      >
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3 text-muted-foreground">
            <BarChart3 className="w-10 h-10 opacity-20" />
            <p className="text-sm font-medium">No trades recorded yet</p>
            <p className="text-xs opacity-60 max-w-xs text-center">
              Wins and losses are tracked automatically when price reaches a target or stop level on the Intraday or Swing signals.
              Best Options trades can be logged manually.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/5">
                  <th className="text-left px-5 py-3 text-[10px] font-bold text-muted-foreground uppercase tracking-widest">#</th>
                  <th className="text-left px-4 py-3 text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Date</th>
                  <th className="text-left px-4 py-3 text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Time</th>
                  <th className="text-left px-4 py-3 text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Mode</th>
                  <th className="text-left px-4 py-3 text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Direction</th>
                  <th className="text-left px-4 py-3 text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Outcome</th>
                  <th className="text-left px-4 py-3 text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Result</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r, i) => {
                  const isWin = r.outcome === "T1" || r.outcome === "T2";
                  const isLoss = r.outcome === "SL";
                  return (
                    <motion.tr
                      key={r.id}
                      initial={{ opacity: 0, x: -8 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: i * 0.02 }}
                      className={cn(
                        "border-b border-white/4 transition-colors hover:bg-white/3",
                        isWin  && "bg-emerald-500/3",
                        isLoss && "bg-red-500/3",
                      )}
                    >
                      <td className="px-5 py-3.5 text-muted-foreground/50 text-xs font-mono">{filtered.length - i}</td>
                      <td className="px-4 py-3.5 text-xs text-muted-foreground font-mono">{fmtDate(r.ts)}</td>
                      <td className="px-4 py-3.5 text-xs text-muted-foreground font-mono">{fmtTime(r.ts)}</td>
                      <td className="px-4 py-3.5"><ModeBadge mode={r.mode} /></td>
                      <td className="px-4 py-3.5"><DirectionBadge dir={r.signal} /></td>
                      <td className="px-4 py-3.5"><OutcomeBadge outcome={r.outcome} /></td>
                      <td className="px-4 py-3.5">
                        <span className={cn("text-xs font-black", isWin ? "text-emerald-400" : isLoss ? "text-red-400" : "text-muted-foreground")}>
                          {isWin ? "WIN" : isLoss ? "LOSS" : "—"}
                        </span>
                      </td>
                    </motion.tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </motion.div>
    </div>
  );
}
