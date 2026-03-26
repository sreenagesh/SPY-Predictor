import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Trophy, Medal, TrendingUp, TrendingDown, Clock,
  RefreshCw, AlertCircle, Zap, Calendar, ChevronDown, ChevronUp,
} from "lucide-react";
import type { BestOptionCandidate, BestOptionsResponse } from "@workspace/api-client-react";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(n: number, decimals = 2) {
  return n.toFixed(decimals);
}

function fmtPrice(n: number) {
  return `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatExpiry(dateStr: string) {
  return new Date(dateStr + "T00:00:00Z").toLocaleDateString("en-US", {
    month: "short", day: "numeric", timeZone: "UTC",
  });
}

function MomentumBar({ score }: { score: number }) {
  const clamped = Math.max(-100, Math.min(100, score));
  const pct = Math.abs(clamped) / 100;
  const color = score > 0 ? "#22c55e" : score < 0 ? "#ef4444" : "#f59e0b";
  const label = score > 0 ? `+${score}` : `${score}`;
  const textColor = score > 0 ? "text-bullish" : score < 0 ? "text-bearish" : "text-neutral";

  return (
    <div className="space-y-1">
      <div className="flex justify-between items-center">
        <span className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider">Momentum</span>
        <span className={`text-[10px] font-bold font-mono ${textColor}`}>{label}</span>
      </div>
      <div className="relative h-1.5 bg-secondary/50 rounded-full overflow-hidden">
        <div className="absolute left-1/2 top-0 w-px h-full bg-white/20" />
        <div
          className="absolute top-0 h-full rounded-full transition-all duration-500"
          style={{
            left: clamped >= 0 ? "50%" : `${50 - pct * 50}%`,
            width: `${pct * 50}%`,
            backgroundColor: color,
          }}
        />
      </div>
    </div>
  );
}

function RankBadge({ rank }: { rank: number }) {
  const cfg = {
    1: { icon: Trophy, color: "text-yellow-400", bg: "bg-yellow-400/15 border-yellow-400/30", label: "#1" },
    2: { icon: Medal, color: "text-slate-300",   bg: "bg-slate-300/15 border-slate-300/30",   label: "#2" },
    3: { icon: Medal, color: "text-amber-600",   bg: "bg-amber-600/15 border-amber-600/30",   label: "#3" },
  }[rank] ?? { icon: Medal, color: "text-muted-foreground", bg: "bg-secondary/50 border-white/10", label: `#${rank}` };

  const Icon = cfg.icon;
  return (
    <div className={`flex items-center gap-1 px-2 py-0.5 rounded-full border text-[10px] font-bold ${cfg.color} ${cfg.bg}`}>
      <Icon className="w-2.5 h-2.5" />
      {cfg.label}
    </div>
  );
}

// ─── Individual Option Card ───────────────────────────────────────────────────

function OptionCard({ opt, rank }: { opt: BestOptionCandidate; rank: number }) {
  const [expanded, setExpanded] = useState(false);
  const isCall = opt.side === "CALL";
  const accent = isCall
    ? { text: "text-bullish", bg: "bg-bullish/8 border-bullish/20", glow: "shadow-[0_0_30px_-6px_rgba(34,197,94,0.2)]", stripe: "bg-bullish", badge: "bg-bullish/20 text-bullish border-bullish/30" }
    : { text: "text-bearish", bg: "bg-bearish/8 border-bearish/20", glow: "shadow-[0_0_30px_-6px_rgba(239,68,68,0.2)]", stripe: "bg-bearish", badge: "bg-bearish/20 text-bearish border-bearish/30" };

  const expDate = formatExpiry(opt.expiration);
  const pnlPercent = {
    t1: "+50%", t2: "+150%", t3: "+300%", sl: "−50%",
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: rank * 0.08 }}
      className={`rounded-2xl border ${accent.bg} ${accent.glow} overflow-hidden`}
    >
      {/* Header */}
      <div className="px-4 py-3 flex items-center justify-between gap-2 flex-wrap border-b border-white/5">
        <div className="flex items-center gap-2 flex-wrap">
          <RankBadge rank={rank} />
          <span className={`text-sm font-black font-mono tracking-tight ${accent.text}`}>
            {opt.symbol}
          </span>
          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md border ${accent.badge}`}>
            {opt.side}
          </span>
          <span className="text-xs text-muted-foreground font-mono">
            ${opt.strike} · {expDate}
          </span>
          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${accent.badge}`}>
            {opt.daysToExpiry} DTE
          </span>
        </div>
        <div className="flex items-center gap-2">
          {opt.iv > 0 && (
            <span className="text-[10px] text-muted-foreground">IV {fmt(opt.iv, 0)}%</span>
          )}
          <span className="text-[10px] text-muted-foreground">
            Δ {fmt(opt.delta, 2)}
          </span>
        </div>
      </div>

      {/* Premium targets — 4-column grid */}
      <div className="p-4">
        <div className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest mb-2.5">
          Option Premium Targets
        </div>
        <div className="grid grid-cols-4 gap-2 mb-3">
          {[
            { label: "BUY AT", value: `$${fmt(opt.entry)}`, color: "text-foreground", bg: "bg-white/5 border-white/10" },
            { label: `T1 ${pnlPercent.t1}`, value: `$${fmt(opt.t1)}`, color: "text-bullish", bg: "bg-bullish/8 border-bullish/20" },
            { label: `T2 ${pnlPercent.t2}`, value: `$${fmt(opt.t2)}`, color: "text-bullish", bg: "bg-bullish/8 border-bullish/20" },
            { label: `T3 ${pnlPercent.t3}`, value: `$${fmt(opt.t3)}`, color: "text-emerald-300", bg: "bg-emerald-400/8 border-emerald-400/20" },
          ].map((item, i) => (
            <div key={i} className={`rounded-xl border ${item.bg} p-2.5 flex flex-col gap-0.5 text-center`}>
              <span className="text-[8px] font-bold text-muted-foreground uppercase tracking-wider leading-tight">{item.label}</span>
              <span className={`text-xs font-black font-mono ${item.color}`}>{item.value}</span>
            </div>
          ))}
        </div>

        {/* Stop */}
        <div className="flex items-center gap-2 mb-3">
          <div className="h-px flex-1 bg-bearish/20" />
          <span className="text-[9px] text-muted-foreground whitespace-nowrap">
            STOP {pnlPercent.sl} → exit at <span className="font-mono font-bold text-bearish">${fmt(opt.sl)}</span>
            <span className="mx-2 opacity-40">·</span>
            R:R 1:6 (T3)
          </span>
          <div className="h-px flex-1 bg-bearish/20" />
        </div>

        {/* Momentum bar */}
        <MomentumBar score={opt.momentumScore} />

        {/* Expandable underlying targets */}
        <button
          onClick={() => setExpanded(e => !e)}
          className="w-full flex items-center justify-between mt-3 pt-2 border-t border-white/5 text-[9px] font-bold text-muted-foreground uppercase tracking-widest hover:text-foreground transition-colors"
        >
          <span>Underlying Price Levels</span>
          {expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
        </button>

        <AnimatePresence>
          {expanded && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="overflow-hidden"
            >
              <div className="pt-2 space-y-2">
                <div className="grid grid-cols-4 gap-2">
                  {[
                    { label: "ENTRY", value: fmtPrice(opt.currentPrice), color: "text-foreground", bg: "bg-white/5 border-white/8" },
                    { label: "T1", value: fmtPrice(opt.underlyingT1), color: isCall ? "text-bullish" : "text-bearish", bg: isCall ? "bg-bullish/8 border-bullish/20" : "bg-bearish/8 border-bearish/20" },
                    { label: "T2", value: fmtPrice(opt.underlyingT2), color: isCall ? "text-bullish" : "text-bearish", bg: isCall ? "bg-bullish/8 border-bullish/20" : "bg-bearish/8 border-bearish/20" },
                    { label: "T3", value: fmtPrice(opt.underlyingT3), color: "text-emerald-300", bg: "bg-emerald-400/8 border-emerald-400/20" },
                  ].map((item, i) => (
                    <div key={i} className={`rounded-xl border ${item.bg} p-2.5 flex flex-col gap-0.5 text-center`}>
                      <span className="text-[8px] font-bold text-muted-foreground uppercase tracking-wider">{item.label}</span>
                      <span className={`text-[10px] font-bold font-mono ${item.color}`}>{item.value}</span>
                    </div>
                  ))}
                </div>
                <p className="text-[9px] text-muted-foreground/70 italic pt-0.5">{opt.reason}</p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Stats strip */}
      <div className="px-4 pb-3 flex items-center gap-4 flex-wrap">
        {opt.openInterest > 0 && (
          <span className="text-[9px] text-muted-foreground/70">
            OI <span className="font-mono font-bold text-muted-foreground">{opt.openInterest.toLocaleString()}</span>
          </span>
        )}
        {opt.volume > 0 && (
          <span className="text-[9px] text-muted-foreground/70">
            Vol <span className="font-mono font-bold text-muted-foreground">{opt.volume.toLocaleString()}</span>
          </span>
        )}
        <span className="text-[9px] text-muted-foreground/70">
          Score <span className="font-mono font-bold text-muted-foreground">{opt.compositeScore}</span>
        </span>
      </div>
    </motion.div>
  );
}

// ─── Timeframe Section ────────────────────────────────────────────────────────

function TimeframeSection({
  label,
  icon: Icon,
  subtitle,
  options,
}: {
  label: string;
  icon: React.ElementType;
  subtitle: string;
  options: BestOptionCandidate[];
}) {
  if (options.length === 0) {
    return (
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <Icon className="w-4 h-4 text-muted-foreground" />
          <h3 className="text-sm font-bold text-foreground">{label}</h3>
          <span className="text-[10px] text-muted-foreground/60 bg-secondary/40 px-2 py-0.5 rounded-full">{subtitle}</span>
        </div>
        <div className="rounded-2xl border border-white/5 bg-white/2 p-8 flex items-center justify-center gap-3 text-muted-foreground">
          <AlertCircle className="w-4 h-4 opacity-50 flex-shrink-0" />
          <p className="text-sm">No high-conviction setups found in this timeframe</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Icon className="w-4 h-4 text-muted-foreground" />
        <h3 className="text-sm font-bold text-foreground">{label}</h3>
        <span className="text-[10px] text-muted-foreground/60 bg-secondary/40 px-2 py-0.5 rounded-full">{subtitle}</span>
        <span className="text-[10px] font-bold text-muted-foreground/50 ml-1">{options.length} picks</span>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {options.map((opt, i) => (
          <OptionCard key={`${opt.symbol}-${opt.strike}-${opt.expiration}`} opt={opt} rank={i + 1} />
        ))}
      </div>
    </div>
  );
}

// ─── Main Export ──────────────────────────────────────────────────────────────

interface BestOptionsTabProps {
  data: BestOptionsResponse | undefined;
  isLoading: boolean;
  isError: boolean;
  onRefresh?: () => void;
}

export function BestOptionsTab({ data, isLoading, isError, onRefresh }: BestOptionsTabProps) {
  if (isLoading && !data) {
    return (
      <div className="space-y-6">
        {["Intraday (0–3 DTE)", "Weekly (4–10 DTE)"].map((label, si) => (
          <div key={si} className="space-y-3">
            <div className="h-5 bg-white/5 rounded w-48 animate-pulse" />
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {[1, 2, 3].map(i => (
                <div key={i} className="h-48 rounded-2xl bg-white/5 animate-pulse" />
              ))}
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="space-y-4">
        <div className="rounded-2xl border border-amber-500/20 bg-amber-500/5 p-6 flex items-start gap-3">
          <RefreshCw className="w-5 h-5 text-amber-400 mt-0.5 flex-shrink-0 animate-spin" />
          <div className="space-y-2">
            <p className="text-sm font-semibold text-foreground">Scanner warming up…</p>
            <p className="text-sm text-muted-foreground">
              The first scan takes ~15 seconds as we pull live options chains from Tradier for all 12 tickers.
              It auto-retries — or click Refresh below.
            </p>
            {onRefresh && (
              <button
                onClick={onRefresh}
                className="flex items-center gap-2 text-xs font-semibold text-amber-400 hover:text-amber-300 transition-colors mt-2 px-3 py-1.5 rounded-lg border border-amber-500/30 hover:border-amber-400/50"
              >
                <RefreshCw className="w-3 h-3" />
                Refresh scan now
              </button>
            )}
          </div>
        </div>

        {/* Skeleton placeholders */}
        <div className="space-y-3">
          <div className="h-4 bg-white/5 rounded w-40 animate-pulse" />
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-56 rounded-2xl bg-white/5 animate-pulse" style={{ animationDelay: `${i * 0.15}s` }} />
            ))}
          </div>
        </div>
        <div className="space-y-3">
          <div className="h-4 bg-white/5 rounded w-32 animate-pulse" />
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-56 rounded-2xl bg-white/5 animate-pulse" style={{ animationDelay: `${i * 0.15 + 0.5}s` }} />
            ))}
          </div>
        </div>
      </div>
    );
  }

  const scannedTime = new Date(data.scannedAt).toLocaleTimeString("en-US", {
    hour: "2-digit", minute: "2-digit",
  });

  const totalPicks = data.intraday.length + data.weekly.length;

  return (
    <div className="space-y-6">
      {/* Header strip */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <Trophy className="w-4 h-4 text-yellow-400" />
          <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
            {totalPicks} explosive setups · {data.marketOpen ? "Live data" : "Pre/Post-market data"}
          </span>
          <span className="text-[10px] text-muted-foreground/50">· Scanned {scannedTime}</span>
        </div>
        {onRefresh && (
          <button
            onClick={onRefresh}
            className="flex items-center gap-1.5 text-[10px] text-muted-foreground hover:text-foreground transition-colors px-2 py-1 rounded-lg hover:bg-white/5"
          >
            <RefreshCw className="w-3 h-3" />
            Refresh scan
          </button>
        )}
      </div>

      {/* Intraday picks */}
      <TimeframeSection
        label="Intraday Picks"
        icon={Zap}
        subtitle="0–3 DTE · ATM · Enter ±30 min"
        options={data.intraday}
      />

      {/* Divider */}
      <div className="flex items-center gap-3">
        <div className="flex-1 h-px bg-white/5" />
        <span className="text-[10px] text-muted-foreground/40 uppercase tracking-widest">Weekly</span>
        <div className="flex-1 h-px bg-white/5" />
      </div>

      {/* Weekly picks */}
      <TimeframeSection
        label="Weekly Picks"
        icon={Calendar}
        subtitle="4–10 DTE · Slightly OTM · Hold overnight"
        options={data.weekly}
      />

      {/* Disclaimer */}
      <p className="text-[10px] text-muted-foreground/40 text-center leading-relaxed">
        Options are ranked by momentum conviction, delta quality, liquidity, and spread tightness.
        Always verify live quotes before entry. Not financial advice.
      </p>
    </div>
  );
}
