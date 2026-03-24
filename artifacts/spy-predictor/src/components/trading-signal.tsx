import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Zap, TrendingUp, Clock, Calendar, AlertCircle,
  Shield, Target, ChevronDown, ChevronUp, Info,
} from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import type { TradingSignalResponse } from "@workspace/api-client-react";

interface TradingSignalCardProps {
  intradaySignal: TradingSignalResponse | undefined;
  swingSignal: TradingSignalResponse | undefined;
  isLoadingIntraday: boolean;
  isLoadingSwing: boolean;
  onModeChange?: (mode: "intraday" | "swing") => void;
}

// ─── Market status pill ────────────────────────────────────────────────────────

function MarketStatusBadge({ status }: { status: string }) {
  const cfg = {
    open:       { label: "MARKET OPEN",   dot: "bg-emerald-400", text: "text-emerald-400" },
    premarket:  { label: "PRE-MARKET",    dot: "bg-amber-400",   text: "text-amber-400" },
    afterhours: { label: "AFTER HOURS",   dot: "bg-blue-400",    text: "text-blue-400" },
    closed:     { label: "MARKET CLOSED", dot: "bg-slate-400",   text: "text-slate-400" },
  }[status] ?? { label: status.toUpperCase(), dot: "bg-slate-400", text: "text-slate-400" };

  return (
    <div className="flex items-center gap-1.5">
      <span className={`w-2 h-2 rounded-full ${cfg.dot} ${status === "open" ? "animate-pulse" : ""}`} />
      <span className={`text-[10px] font-bold tracking-wider ${cfg.text}`}>{cfg.label}</span>
    </div>
  );
}

// ─── Live countdown to next 5-min bar ─────────────────────────────────────────

function CountdownTimer({ seconds }: { seconds: number }) {
  const [remaining, setRemaining] = useState(seconds);
  useEffect(() => {
    setRemaining(seconds);
    const interval = setInterval(() => setRemaining(r => Math.max(0, r - 1)), 1000);
    return () => clearInterval(interval);
  }, [seconds]);
  const min = Math.floor(remaining / 60);
  const sec = remaining % 60;
  return (
    <div className="flex items-center gap-1 text-xs text-muted-foreground">
      <Clock className="w-3 h-3" />
      <span>Bar closes in <span className="font-mono font-bold text-foreground">{min}:{String(sec).padStart(2, "0")}</span></span>
    </div>
  );
}

// ─── The hero trade card — first thing user sees ───────────────────────────────

function TradeHeroCard({ signal }: { signal: TradingSignalResponse }) {
  const { trade, mode, signal: sig } = signal;
  if (!trade) return null;

  const isCall = trade.side === "CALL";
  const accentColor = isCall ? "text-bullish" : "text-bearish";
  const accentBg    = isCall ? "bg-bullish/8 border-bullish/20" : "bg-bearish/8 border-bearish/20";
  const accentStripe = isCall ? "bg-bullish" : "bg-bearish";

  const expDate = new Date(trade.expiration + "T00:00:00Z").toLocaleDateString("en-US", {
    month: "short", day: "numeric", timeZone: "UTC",
  });

  const t1Label = mode === "intraday" ? "1.5×" : "2×";
  const t2Label = mode === "intraday" ? "2.5×" : "4×";
  const slLabel = mode === "intraday" ? "−30%" : "−50%";

  return (
    <div className={`rounded-2xl border ${accentBg} overflow-hidden`}>
      {/* Contract headline */}
      <div className="px-4 py-3 flex items-center justify-between gap-2 border-b border-white/5">
        <div className="flex items-center gap-2 flex-wrap">
          <span className={`text-base font-black font-mono tracking-tight ${accentColor}`}>
            SPY {trade.strike} {trade.side}
          </span>
          <span className="text-xs text-muted-foreground/60">·</span>
          <span className="text-xs text-muted-foreground font-medium">{expDate}</span>
          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${accentBg} ${accentColor}`}>
            {trade.daysToExpiry} DTE
          </span>
          {trade.impliedVolatility != null && (
            <span className="text-[10px] text-muted-foreground">IV {trade.impliedVolatility.toFixed(1)}%</span>
          )}
          {trade.openInterest != null && (
            <span className="text-[10px] text-muted-foreground">OI {trade.openInterest.toLocaleString()}</span>
          )}
        </div>
      </div>

      {/* Option premium levels — the critical info */}
      <div className="p-4">
        <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-3 flex items-center gap-2">
          <Target className="w-3 h-3" />
          Option Premium Targets
        </div>

        {/* 4-column premium grid */}
        <div className="grid grid-cols-4 gap-2 mb-4">
          {[
            { label: "BUY AT", value: `$${trade.premiumEntry.toFixed(2)}`, color: "text-foreground",  bg: "bg-white/5 border-white/10", icon: null },
            { label: `T1 (${t1Label})`, value: `$${trade.premiumT1.toFixed(2)}`, color: "text-bullish", bg: "bg-bullish/8 border-bullish/20", icon: null },
            { label: `T2 (${t2Label})`, value: `$${trade.premiumT2.toFixed(2)}`, color: "text-bullish", bg: "bg-bullish/8 border-bullish/20", icon: null },
            { label: `STOP (${slLabel})`, value: `$${trade.premiumStop.toFixed(2)}`, color: "text-bearish", bg: "bg-bearish/8 border-bearish/20", icon: null },
          ].map((item, i) => (
            <div key={i} className={`rounded-xl border ${item.bg} p-3 flex flex-col gap-1 text-center`}>
              <span className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider leading-tight">{item.label}</span>
              <span className={`text-sm font-black font-mono ${item.color}`}>{item.value}</span>
            </div>
          ))}
        </div>

        {/* Visual flow indicator */}
        <div className="flex items-center gap-1 mb-4 overflow-x-auto pb-1">
          <div className={`h-px flex-1 ${accentStripe} opacity-30`} />
          <span className="text-[10px] text-muted-foreground whitespace-nowrap">
            Enter ${trade.premiumEntry.toFixed(2)} → T1 ${trade.premiumT1.toFixed(2)} (sell ½) → T2 ${trade.premiumT2.toFixed(2)} (exit rest) · Stop ${trade.premiumStop.toFixed(2)}
          </span>
          <div className={`h-px flex-1 ${accentStripe} opacity-30`} />
        </div>

        {/* SPY underlying levels */}
        <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-2 flex items-center gap-2">
          <TrendingUp className="w-3 h-3" />
          SPY Price Levels
        </div>
        <div className="grid grid-cols-4 gap-2">
          {[
            { label: "ENTRY", value: formatCurrency(trade.underlyingEntry), color: "text-foreground",  bg: "bg-white/5 border-white/8" },
            { label: "T1", value: formatCurrency(trade.underlyingT1), color: isCall ? "text-bullish" : "text-bearish", bg: isCall ? "bg-bullish/8 border-bullish/20" : "bg-bearish/8 border-bearish/20" },
            { label: "T2", value: formatCurrency(trade.underlyingT2), color: isCall ? "text-bullish" : "text-bearish", bg: isCall ? "bg-bullish/8 border-bullish/20" : "bg-bearish/8 border-bearish/20" },
            { label: "STOP", value: formatCurrency(trade.underlyingStop), color: "text-bearish", bg: "bg-bearish/8 border-bearish/20" },
          ].map((item, i) => (
            <div key={i} className={`rounded-xl border ${item.bg} p-3 flex flex-col gap-1 text-center`}>
              <span className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider">{item.label}</span>
              <span className={`text-xs font-bold font-mono ${item.color}`}>{item.value}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── WAIT state card ───────────────────────────────────────────────────────────

function WaitCard({ signal }: { signal: TradingSignalResponse }) {
  return (
    <div className="rounded-2xl border border-neutral/20 bg-neutral/5 p-6 text-center space-y-3">
      <div className="w-14 h-14 rounded-full bg-neutral/15 flex items-center justify-center mx-auto">
        <Clock className="w-7 h-7 text-neutral" />
      </div>
      <div>
        <p className="text-2xl font-black text-neutral">WAIT</p>
        <p className="text-sm text-muted-foreground mt-1">No high-conviction setup right now</p>
      </div>
      <p className="text-sm text-muted-foreground italic leading-relaxed max-w-sm mx-auto">
        {signal.reasoning}
      </p>
    </div>
  );
}

// ─── Momentum + strength row ───────────────────────────────────────────────────

function StrengthRow({ signal }: { signal: TradingSignalResponse }) {
  const confidence = Math.round(signal.confidence);
  const score = signal.score;
  const clamped = Math.max(-100, Math.min(100, score));
  const pct = Math.abs(clamped) / 100;
  const confColor = confidence >= 70 ? "bg-bullish" : confidence >= 50 ? "bg-neutral" : "bg-bearish";
  const scoreColor = score > 0 ? "#22c55e" : score < 0 ? "#ef4444" : "#f59e0b";
  const scoreText = score > 0 ? `text-bullish` : score < 0 ? `text-bearish` : `text-neutral`;

  return (
    <div className="grid grid-cols-2 gap-4 px-4 py-3 border-b border-white/5">
      <div className="space-y-1.5">
        <div className="flex justify-between items-center">
          <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wide">Signal Strength</span>
          <span className="text-xs font-bold font-mono">{confidence}%</span>
        </div>
        <div className="h-1.5 bg-secondary/50 rounded-full overflow-hidden">
          <div className={`h-full rounded-full transition-all duration-700 ${confColor}`}
            style={{ width: `${confidence}%` }} />
        </div>
      </div>
      <div className="space-y-1.5">
        <div className="flex justify-between items-center">
          <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wide">Momentum</span>
          <span className={`text-xs font-bold font-mono ${scoreText}`}>
            {score > 0 ? "+" : ""}{score}
          </span>
        </div>
        <div className="relative h-1.5 bg-secondary/50 rounded-full overflow-hidden">
          <div className="absolute left-1/2 top-0 w-px h-full bg-white/20" />
          <div
            className="absolute top-0 h-full rounded-full transition-all duration-700"
            style={{
              left: clamped >= 0 ? "50%" : `${50 - pct * 50}%`,
              width: `${pct * 50}%`,
              backgroundColor: scoreColor,
            }}
          />
        </div>
      </div>
    </div>
  );
}

// ─── Collapsible analysis section ─────────────────────────────────────────────

function AnalysisSection({ signal }: { signal: TradingSignalResponse }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="border-t border-white/5">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-4 py-3 text-xs font-bold text-muted-foreground uppercase tracking-widest hover:text-foreground transition-colors"
      >
        <span>Analysis Details ({signal.keyFactors.length} factors)</span>
        {open ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25 }}
            className="overflow-hidden"
          >
            {/* Key factors */}
            {signal.keyFactors.length > 0 && (
              <div className="px-4 pb-3 space-y-2">
                {signal.keyFactors.map((factor, i) => {
                  const isBull = /bullish|above|rising|oversold|positive|upward|reclaim/i.test(factor);
                  const isBear = /bearish|below|falling|overbought|negative|downward|expanding|rejected/i.test(factor);
                  return (
                    <div key={i} className="flex items-start gap-2 text-sm">
                      <span className={`mt-0.5 text-xs font-bold ${isBull ? "text-bullish" : isBear ? "text-bearish" : "text-muted-foreground"}`}>
                        {isBull ? "▲" : isBear ? "▼" : "•"}
                      </span>
                      <span className="text-muted-foreground leading-snug">{factor}</span>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Reasoning */}
            <div className="px-4 pb-4 flex items-start gap-2 text-muted-foreground border-t border-white/5 pt-3">
              <Info className="w-4 h-4 mt-0.5 flex-shrink-0 opacity-60" />
              <p className="text-sm italic opacity-75 leading-relaxed">{signal.reasoning}</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── Full signal body ──────────────────────────────────────────────────────────

function SignalBody({ signal }: { signal: TradingSignalResponse }) {
  const cfg = {
    CALL: { color: "text-bullish", bg: "bg-bullish/10", border: "border-bullish/30", glow: "shadow-[0_0_40px_-4px_rgba(34,197,94,0.25)]", dot: "bg-bullish" },
    PUT:  { color: "text-bearish", bg: "bg-bearish/10",  border: "border-bearish/30",  glow: "shadow-[0_0_40px_-4px_rgba(239,68,68,0.25)]",  dot: "bg-bearish" },
    WAIT: { color: "text-neutral", bg: "bg-neutral/5",   border: "border-neutral/20",  glow: "",                                               dot: "bg-neutral" },
  }[signal.signal];

  const modeLabel = signal.mode === "intraday"
    ? "5-min · 0-1 DTE"
    : "Daily · 3-7 DTE · Enter ~3:45 PM";

  return (
    <div className={`rounded-2xl border ${cfg.border} ${cfg.glow} overflow-hidden`}>

      {/* ── Top bar: signal + mode + timer + market status ── */}
      <div className={`${cfg.bg} px-4 py-4 flex items-center justify-between gap-3 flex-wrap`}>
        <div className="flex items-center gap-3">
          <span className={`w-3.5 h-3.5 rounded-full ${cfg.dot} ${signal.signal !== "WAIT" ? "animate-pulse" : ""}`} />
          <span className={`text-5xl font-black tracking-tight ${cfg.color}`}>{signal.signal}</span>
          <div className="flex flex-col gap-0.5 ml-1">
            <span className="text-xs text-muted-foreground font-medium">{modeLabel}</span>
            {signal.mode === "intraday" && signal.nextBarIn != null && (
              <CountdownTimer seconds={signal.nextBarIn} />
            )}
            {signal.mode === "swing" && signal.targetDate && (
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                <Calendar className="w-3 h-3" />
                <span>Entry: <span className="font-medium text-foreground">{signal.targetDate}</span></span>
              </div>
            )}
          </div>
        </div>
        <MarketStatusBadge status={signal.marketStatus} />
      </div>

      {/* ── Strength row ── */}
      {signal.signal !== "WAIT" && <StrengthRow signal={signal} />}

      {/* ── Trade hero (CALL/PUT) or WAIT card ── */}
      <div className="p-4">
        {signal.signal !== "WAIT" && signal.trade ? (
          <TradeHeroCard signal={signal} />
        ) : (
          <WaitCard signal={signal} />
        )}
      </div>

      {/* ── Collapsible analysis ── */}
      {signal.signal !== "WAIT" && <AnalysisSection signal={signal} />}
    </div>
  );
}

// ─── Exported card with mode switcher ─────────────────────────────────────────

export function TradingSignalCard({
  intradaySignal,
  swingSignal,
  isLoadingIntraday,
  isLoadingSwing,
  onModeChange,
}: TradingSignalCardProps) {
  const [mode, setMode] = useState<"intraday" | "swing">("intraday");

  const handleModeChange = (m: "intraday" | "swing") => {
    setMode(m);
    onModeChange?.(m);
  };

  const signal = mode === "intraday" ? intradaySignal : swingSignal;
  const isLoading = mode === "intraday" ? isLoadingIntraday : isLoadingSwing;

  return (
    <div className="space-y-3">
      {/* Mode tabs */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-1 p-1 bg-secondary/40 rounded-xl">
          <button
            onClick={() => handleModeChange("intraday")}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all duration-200 ${
              mode === "intraday"
                ? "bg-primary text-primary-foreground shadow-lg shadow-primary/20"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Zap className="w-4 h-4" />
            Intraday Scalp
          </button>
          <button
            onClick={() => handleModeChange("swing")}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all duration-200 ${
              mode === "swing"
                ? "bg-primary text-primary-foreground shadow-lg shadow-primary/20"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <TrendingUp className="w-4 h-4" />
            Swing / BTST
          </button>
        </div>

        <div className="text-[11px] text-muted-foreground/70 bg-secondary/30 px-3 py-1.5 rounded-lg">
          {mode === "intraday"
            ? "ATM · 0-1 DTE · T1 +50% · T2 +150% · Stop −30%"
            : "OTM · 3-7 DTE · T1 +100% · T2 +300% · Stop −50%"}
        </div>
      </div>

      {/* Signal */}
      <AnimatePresence mode="wait">
        {isLoading && !signal ? (
          <motion.div
            key="loading"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="h-64 rounded-2xl border border-white/5 bg-white/5 animate-pulse flex items-center justify-center"
          >
            <div className="text-muted-foreground text-sm">
              Analyzing {mode === "intraday" ? "5-min" : "daily"} bars…
            </div>
          </motion.div>
        ) : signal ? (
          <motion.div
            key={mode}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.3 }}
          >
            <SignalBody signal={signal} />
          </motion.div>
        ) : (
          <motion.div
            key="error"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="rounded-2xl border border-destructive/20 bg-destructive/5 p-8 flex items-center gap-3 text-muted-foreground"
          >
            <AlertCircle className="w-5 h-5 text-destructive/70 flex-shrink-0" />
            <p className="text-sm">Unable to load {mode} signal. Market may be closed or data unavailable.</p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
