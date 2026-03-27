import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Download, Trash2, Trophy, CheckCircle2, XCircle,
  Zap, TrendingUp, BarChart3, Filter, ChevronDown, ChevronRight,
  Target, DollarSign, ShieldAlert, ArrowRight,
} from "lucide-react";
import { getAllScores, clearScores, type TradeRecord, type TradeMode, type TradeDetails } from "@/hooks/use-trade-tracker";
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
function fmtP(v?: number) {
  return v != null && v > 0 ? `$${v.toFixed(2)}` : "—";
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

// ─── Expanded Trade Detail Panel ───────────────────────────────────────────────

function DetailCell({
  label, value, highlight, dim,
}: { label: string; value: string; highlight?: boolean; dim?: boolean }) {
  return (
    <div className={cn("flex flex-col gap-0.5 min-w-[80px]", dim && "opacity-40")}>
      <span className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground/60">{label}</span>
      <span className={cn("text-xs font-mono font-bold", highlight ? "text-foreground" : "text-muted-foreground/80")}>{value}</span>
    </div>
  );
}

function LevelFlow({
  outcome, details, signal,
}: { outcome: string; details: TradeDetails; signal: "CALL" | "PUT" }) {
  const hitT1 = outcome === "T1" || outcome === "T2";
  const hitT2 = outcome === "T2";
  const hitSL = outcome === "SL";

  const dot = (active: boolean, color: string) => (
    <span className={cn("inline-flex w-2 h-2 rounded-full shrink-0 mt-0.5", active ? color : "bg-white/10")} />
  );

  return (
    <div className="flex items-start gap-2 flex-wrap">
      {/* Entry */}
      <div className="flex items-center gap-1.5">
        {dot(true, "bg-blue-400")}
        <div className="flex flex-col">
          <span className="text-[9px] text-muted-foreground/50 uppercase tracking-wider">Entry</span>
          <span className="text-xs font-mono font-bold text-blue-400">{fmtP(details.entryPrice)}</span>
          {details.entryPremium && <span className="text-[10px] text-muted-foreground/50 font-mono">Prem: {fmtP(details.entryPremium)}</span>}
        </div>
      </div>

      <ArrowRight className="w-3 h-3 text-muted-foreground/30 mt-3 shrink-0" />

      {/* T1 */}
      <div className="flex items-center gap-1.5">
        {dot(hitT1, "bg-emerald-400")}
        <div className="flex flex-col">
          <span className={cn("text-[9px] uppercase tracking-wider", hitT1 ? "text-emerald-400/70" : "text-muted-foreground/50")}>T1 {hitT1 ? "✓" : ""}</span>
          <span className={cn("text-xs font-mono font-bold", hitT1 ? "text-emerald-400" : "text-muted-foreground/60")}>{fmtP(details.t1Price)}</span>
          {details.t1Premium && <span className="text-[10px] text-muted-foreground/50 font-mono">Prem: {fmtP(details.t1Premium)}</span>}
        </div>
      </div>

      <ArrowRight className="w-3 h-3 text-muted-foreground/30 mt-3 shrink-0" />

      {/* T2 */}
      <div className="flex items-center gap-1.5">
        {dot(hitT2, "bg-yellow-400")}
        <div className="flex flex-col">
          <span className={cn("text-[9px] uppercase tracking-wider", hitT2 ? "text-yellow-400/70" : "text-muted-foreground/50")}>T2 {hitT2 ? "✓" : ""}</span>
          <span className={cn("text-xs font-mono font-bold", hitT2 ? "text-yellow-400" : "text-muted-foreground/60")}>{fmtP(details.t2Price)}</span>
          {details.t2Premium && <span className="text-[10px] text-muted-foreground/50 font-mono">Prem: {fmtP(details.t2Premium)}</span>}
        </div>
      </div>

      <div className="flex items-center gap-1 mx-1 self-center">
        <span className="text-muted-foreground/20 text-xs">|</span>
      </div>

      {/* Stop */}
      <div className="flex items-center gap-1.5">
        {dot(hitSL, "bg-red-400")}
        <div className="flex flex-col">
          <span className={cn("text-[9px] uppercase tracking-wider", hitSL ? "text-red-400/70" : "text-muted-foreground/50")}>Stop {hitSL ? "✗" : ""}</span>
          <span className={cn("text-xs font-mono font-bold", hitSL ? "text-red-400" : "text-muted-foreground/60")}>{fmtP(details.stopPrice)}</span>
          {details.stopPremium && <span className="text-[10px] text-muted-foreground/50 font-mono">Prem: {fmtP(details.stopPremium)}</span>}
        </div>
      </div>
    </div>
  );
}

function ExpandedRow({ r }: { r: TradeRecord }) {
  const d = r.details;

  if (!d) {
    return (
      <tr className="border-b border-white/4 bg-white/[0.015]">
        <td colSpan={8} className="px-8 py-3">
          <p className="text-xs text-muted-foreground/40 italic">No trade details recorded — this trade was logged before detail tracking was enabled.</p>
        </td>
      </tr>
    );
  }

  return (
    <tr className="border-b border-white/4">
      <td colSpan={8} className="px-0 py-0">
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: "auto" }}
          exit={{ opacity: 0, height: 0 }}
          transition={{ duration: 0.2 }}
          className="overflow-hidden"
        >
          <div className={cn(
            "mx-4 mb-4 mt-1 rounded-xl border p-4 grid grid-cols-1 gap-4",
            r.outcome === "T1" || r.outcome === "T2"
              ? "bg-emerald-500/[0.04] border-emerald-500/15"
              : r.outcome === "SL"
              ? "bg-red-500/[0.04] border-red-500/15"
              : "bg-white/[0.02] border-white/8",
          )}>

            {/* Option contract row */}
            <div className="flex items-center gap-6 flex-wrap border-b border-white/5 pb-3">
              <DetailCell label="Strike" value={d.strike ? `$${d.strike}` : "—"} highlight />
              <DetailCell label="Type" value={r.signal} highlight />
              <DetailCell label="Expiry" value={d.expiration ?? "—"} />
              <DetailCell label="DTE" value={d.dte != null ? `${d.dte} DTE` : "—"} />
            </div>

            {/* Price flow */}
            <div>
              <p className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground/40 mb-2">Trade Levels — Underlying Price</p>
              {d.entryPrice ? (
                <LevelFlow outcome={r.outcome} details={d} signal={r.signal} />
              ) : (
                <p className="text-xs text-muted-foreground/40 italic">Price levels not available</p>
              )}
            </div>

            {/* Premium row if available */}
            {(d.entryPremium || d.t1Premium || d.t2Premium || d.stopPremium) && (
              <div className="flex items-center gap-6 flex-wrap border-t border-white/5 pt-3">
                <DetailCell label="Entry Premium" value={fmtP(d.entryPremium)} highlight />
                <DetailCell label="T1 Premium" value={fmtP(d.t1Premium)} highlight={r.outcome === "T1" || r.outcome === "T2"} />
                <DetailCell label="T2 Premium" value={fmtP(d.t2Premium)} highlight={r.outcome === "T2"} />
                <DetailCell label="Stop Premium" value={fmtP(d.stopPremium)} highlight={r.outcome === "SL"} />
              </div>
            )}
          </div>
        </motion.div>
      </td>
    </tr>
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
  const header = "Date,Time,Mode,Direction,Strike,Expiry,DTE,Entry Price,T1 Price,T2 Price,Stop Price,Entry Premium,T1 Premium,T2 Premium,Stop Premium,Outcome,Result\n";
  const rows = records.map(r => {
    const d    = fmtDate(r.ts);
    const t    = fmtTime(r.ts);
    const mode = r.mode === "intraday" ? "Intraday" : r.mode === "swing" ? "Swing/BTST" : "Best Options";
    const res  = r.outcome === "T1" || r.outcome === "T2" ? "Win" : r.outcome === "SL" ? "Loss" : "Open";
    const det  = r.details ?? {};
    return [
      `"${d}"`, `"${t}"`, `"${mode}"`, `"${r.signal}"`,
      det.strike ?? "", `"${det.expiration ?? ""}"`, det.dte ?? "",
      det.entryPrice ?? "", det.t1Price ?? "", det.t2Price ?? "", det.stopPrice ?? "",
      det.entryPremium ?? "", det.t1Premium ?? "", det.t2Premium ?? "", det.stopPremium ?? "",
      `"${r.outcome}"`, `"${res}"`,
    ].join(",");
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
  const [expandedId, setExpandedId]   = useState<string | null>(null);

  const reload = () => setRecords(loadAll().slice().reverse());
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
    setExpandedId(null);
    reload();
  };

  const toggleExpand = (id: string) => setExpandedId(prev => prev === id ? null : id);

  return (
    <div className="space-y-5">
      {/* Page title */}
      <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}>
        <h2 className="text-2xl font-black tracking-tight">Trade History</h2>
        <p className="text-sm text-muted-foreground mt-0.5">All recorded wins and losses, auto-tracked from live signals · <span className="text-primary/60">click any row for full trade details</span></p>
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
                  <th className="w-8 px-3 py-3" />
                  <th className="text-left px-3 py-3 text-[10px] font-bold text-muted-foreground uppercase tracking-widest">#</th>
                  <th className="text-left px-4 py-3 text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Date</th>
                  <th className="text-left px-4 py-3 text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Time</th>
                  <th className="text-left px-4 py-3 text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Mode</th>
                  <th className="text-left px-4 py-3 text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Direction</th>
                  <th className="text-left px-4 py-3 text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Strike / Expiry</th>
                  <th className="text-left px-4 py-3 text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Entry → T1 → T2</th>
                  <th className="text-left px-4 py-3 text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Stop</th>
                  <th className="text-left px-4 py-3 text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Outcome</th>
                  <th className="text-left px-4 py-3 text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Result</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r, i) => {
                  const isWin  = r.outcome === "T1" || r.outcome === "T2";
                  const isLoss = r.outcome === "SL";
                  const isOpen = expandedId === r.id;
                  const det    = r.details;

                  return (
                    <React.Fragment key={r.id}>
                      <motion.tr
                        initial={{ opacity: 0, x: -8 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: i * 0.02 }}
                        onClick={() => toggleExpand(r.id)}
                        className={cn(
                          "border-b border-white/4 transition-colors cursor-pointer select-none",
                          isOpen  ? "bg-white/[0.05]" : "hover:bg-white/[0.03]",
                          !isOpen && isWin  && "bg-emerald-500/[0.03]",
                          !isOpen && isLoss && "bg-red-500/[0.03]",
                        )}
                      >
                        {/* Expand chevron */}
                        <td className="pl-4 pr-1 py-3.5">
                          {isOpen
                            ? <ChevronDown className="w-3.5 h-3.5 text-primary/60" />
                            : <ChevronRight className="w-3.5 h-3.5 text-muted-foreground/30" />}
                        </td>
                        <td className="px-3 py-3.5 text-muted-foreground/50 text-xs font-mono">{filtered.length - i}</td>
                        <td className="px-4 py-3.5 text-xs text-muted-foreground font-mono">{fmtDate(r.ts)}</td>
                        <td className="px-4 py-3.5 text-xs text-muted-foreground font-mono">{fmtTime(r.ts)}</td>
                        <td className="px-4 py-3.5"><ModeBadge mode={r.mode} /></td>
                        <td className="px-4 py-3.5"><DirectionBadge dir={r.signal} /></td>

                        {/* Strike / Expiry */}
                        <td className="px-4 py-3.5">
                          {det?.strike ? (
                            <div className="flex flex-col">
                              <span className="text-xs font-mono font-bold text-foreground/80">${det.strike} {r.signal}</span>
                              <span className="text-[10px] text-muted-foreground/50">{det.expiration ?? ""} · {det.dte != null ? `${det.dte}DTE` : ""}</span>
                            </div>
                          ) : <span className="text-muted-foreground/30 text-xs">—</span>}
                        </td>

                        {/* Entry → T1 → T2 */}
                        <td className="px-4 py-3.5">
                          {det?.entryPrice ? (
                            <div className="flex items-center gap-1 text-[11px] font-mono">
                              <span className="text-blue-400 font-bold">{fmtP(det.entryPrice)}</span>
                              <ArrowRight className="w-2.5 h-2.5 text-muted-foreground/30" />
                              <span className={cn("font-bold", isWin ? "text-emerald-400" : "text-muted-foreground/50")}>{fmtP(det.t1Price)}</span>
                              <ArrowRight className="w-2.5 h-2.5 text-muted-foreground/30" />
                              <span className={cn("font-bold", r.outcome === "T2" ? "text-yellow-400" : "text-muted-foreground/40")}>{fmtP(det.t2Price)}</span>
                            </div>
                          ) : <span className="text-muted-foreground/30 text-xs">—</span>}
                        </td>

                        {/* Stop */}
                        <td className="px-4 py-3.5">
                          {det?.stopPrice
                            ? <span className={cn("text-xs font-mono font-bold", isLoss ? "text-red-400" : "text-muted-foreground/50")}>{fmtP(det.stopPrice)}</span>
                            : <span className="text-muted-foreground/30 text-xs">—</span>}
                        </td>

                        <td className="px-4 py-3.5"><OutcomeBadge outcome={r.outcome} /></td>
                        <td className="px-4 py-3.5">
                          <span className={cn("text-xs font-black", isWin ? "text-emerald-400" : isLoss ? "text-red-400" : "text-muted-foreground")}>
                            {isWin ? "WIN" : isLoss ? "LOSS" : "—"}
                          </span>
                        </td>
                      </motion.tr>

                      {/* Expanded detail panel */}
                      <AnimatePresence>
                        {isOpen && <ExpandedRow r={r} />}
                      </AnimatePresence>
                    </React.Fragment>
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
