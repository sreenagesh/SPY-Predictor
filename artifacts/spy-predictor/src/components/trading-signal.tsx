import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Zap, TrendingUp, Clock, Calendar, AlertCircle, ChevronRight, Target, Shield, Info } from "lucide-react";
import { Card, Badge } from "./ui-elements";
import { formatCurrency } from "@/lib/utils";
import type { TradingSignalResponse } from "@workspace/api-client-react";

interface TradingSignalCardProps {
  intradaySignal: TradingSignalResponse | undefined;
  swingSignal: TradingSignalResponse | undefined;
  isLoadingIntraday: boolean;
  isLoadingSwing: boolean;
  onModeChange?: (mode: "intraday" | "swing") => void;
}

function MarketStatusBadge({ status }: { status: string }) {
  const config = {
    open:       { label: "MARKET OPEN", dot: "bg-emerald-400", text: "text-emerald-400" },
    premarket:  { label: "PRE-MARKET",  dot: "bg-amber-400",   text: "text-amber-400" },
    afterhours: { label: "AFTER HOURS", dot: "bg-blue-400",    text: "text-blue-400" },
    closed:     { label: "MARKET CLOSED", dot: "bg-slate-400", text: "text-slate-400" },
  }[status] ?? { label: status.toUpperCase(), dot: "bg-slate-400", text: "text-slate-400" };

  return (
    <div className="flex items-center gap-1.5">
      <span className={`w-2 h-2 rounded-full ${config.dot} ${status === "open" ? "animate-pulse" : ""}`} />
      <span className={`text-[10px] font-bold tracking-wider ${config.text}`}>{config.label}</span>
    </div>
  );
}

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
      <span>Next bar in <span className="font-mono font-bold text-foreground">{min}:{String(sec).padStart(2, "0")}</span></span>
    </div>
  );
}

function ScoreBar({ score }: { score: number }) {
  const clamped = Math.max(-100, Math.min(100, score));
  const pct = Math.abs(clamped) / 100;
  const color = clamped > 0 ? "#22c55e" : clamped < 0 ? "#ef4444" : "#f59e0b";
  const label = clamped > 0 ? "+" + clamped : String(clamped);
  const textColor = clamped > 0 ? "text-bullish" : clamped < 0 ? "text-bearish" : "text-neutral";

  return (
    <div className="space-y-1.5">
      <div className="flex justify-between items-center">
        <span className="text-xs text-muted-foreground">Momentum Score</span>
        <span className={`text-sm font-bold font-mono ${textColor}`}>{label}</span>
      </div>
      <div className="relative h-2 bg-secondary/50 rounded-full overflow-hidden">
        <div className="absolute left-1/2 top-0 w-px h-full bg-white/20" />
        <div
          className="absolute top-0 h-full rounded-full transition-all duration-700"
          style={{
            left: clamped >= 0 ? "50%" : `${50 - pct * 50}%`,
            width: `${pct * 50}%`,
            backgroundColor: color,
          }}
        />
      </div>
      <div className="flex justify-between">
        <span className="text-[10px] text-muted-foreground/40">Bearish −100</span>
        <span className="text-[10px] text-muted-foreground/40">Bullish +100</span>
      </div>
    </div>
  );
}

function TradePanel({ signal }: { signal: TradingSignalResponse }) {
  if (!signal.trade) return null;
  const { trade, mode } = signal;
  const isCall = trade.side === "CALL";

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
      {/* Premium Levels */}
      <div className="rounded-xl border border-white/8 bg-background/40 overflow-hidden">
        <div className={`px-4 py-2.5 flex items-center gap-2 ${isCall ? "bg-bullish/10" : "bg-bearish/10"}`}>
          <Target className={`w-3.5 h-3.5 ${isCall ? "text-bullish" : "text-bearish"}`} />
          <span className={`text-xs font-bold tracking-wide ${isCall ? "text-bullish" : "text-bearish"}`}>
            PREMIUM LEVELS
          </span>
          <span className="ml-auto text-[10px] text-muted-foreground">
            {mode === "intraday" ? "0-1 DTE · Scalp" : `${trade.daysToExpiry} DTE · BTST`}
          </span>
        </div>
        <div className="p-4 space-y-2.5">
          <div className="flex justify-between">
            <span className="text-xs text-muted-foreground">Entry (Buy at)</span>
            <span className="font-mono font-bold text-foreground">${trade.premiumEntry.toFixed(2)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-xs text-muted-foreground">
              T1 ({mode === "intraday" ? "1.5×" : "2×"})
            </span>
            <span className="font-mono font-bold text-bullish">${trade.premiumT1.toFixed(2)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-xs text-muted-foreground">
              T2 ({mode === "intraday" ? "2.5×" : "4×"})
            </span>
            <span className="font-mono font-bold text-bullish">${trade.premiumT2.toFixed(2)}</span>
          </div>
          <div className="h-px bg-white/5 my-1" />
          <div className="flex justify-between">
            <span className="text-xs text-muted-foreground flex items-center gap-1">
              <Shield className="w-3 h-3 text-destructive/70" />
              Stop Loss ({mode === "intraday" ? "−30%" : "−50%"})
            </span>
            <span className="font-mono font-bold text-destructive">${trade.premiumStop.toFixed(2)}</span>
          </div>
        </div>
      </div>

      {/* Underlying Levels */}
      <div className="rounded-xl border border-white/8 bg-background/40 overflow-hidden">
        <div className="px-4 py-2.5 flex items-center gap-2 bg-white/5">
          <TrendingUp className="w-3.5 h-3.5 text-muted-foreground" />
          <span className="text-xs font-bold tracking-wide text-muted-foreground">UNDERLYING (SPY)</span>
        </div>
        <div className="p-4 space-y-2.5">
          <div className="flex justify-between">
            <span className="text-xs text-muted-foreground">Spot Entry</span>
            <span className="font-mono font-bold">{formatCurrency(trade.underlyingEntry)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-xs text-muted-foreground">T1 Level</span>
            <span className={`font-mono font-bold ${isCall ? "text-bullish" : "text-bearish"}`}>
              {formatCurrency(trade.underlyingT1)}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-xs text-muted-foreground">T2 Level</span>
            <span className={`font-mono font-bold ${isCall ? "text-bullish" : "text-bearish"}`}>
              {formatCurrency(trade.underlyingT2)}
            </span>
          </div>
          <div className="h-px bg-white/5 my-1" />
          <div className="flex justify-between">
            <span className="text-xs text-muted-foreground">Invalidation</span>
            <span className="font-mono font-bold text-destructive">{formatCurrency(trade.underlyingStop)}</span>
          </div>
        </div>
      </div>

      {/* Contract details */}
      <div className="md:col-span-2 flex flex-wrap gap-x-6 gap-y-1.5 px-1">
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <span className="font-medium">Strike:</span>
          <span className="font-mono font-bold text-foreground">{trade.strike}</span>
        </div>
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Calendar className="w-3 h-3" />
          <span>
            {new Date(trade.expiration + "T00:00:00Z").toLocaleDateString("en-US", {
              month: "short", day: "numeric", timeZone: "UTC",
            })}
          </span>
          <span className="text-foreground/50">·</span>
          <span className="text-foreground font-medium">{trade.daysToExpiry} DTE</span>
        </div>
        {trade.impliedVolatility != null && (
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span className="font-medium">IV:</span>
            <span className="font-mono text-foreground">{trade.impliedVolatility.toFixed(1)}%</span>
          </div>
        )}
        {trade.delta != null && (
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span className="font-medium">Δ Delta:</span>
            <span className="font-mono text-foreground">{trade.delta.toFixed(2)}</span>
          </div>
        )}
        {trade.openInterest != null && (
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span className="font-medium">OI:</span>
            <span className="font-mono text-foreground">{trade.openInterest.toLocaleString()}</span>
          </div>
        )}
      </div>
    </div>
  );
}

function SignalBody({ signal }: { signal: TradingSignalResponse }) {
  const cfg = {
    CALL: { color: "text-bullish", bg: "bg-bullish/10", border: "border-bullish/30", glow: "shadow-[0_0_40px_-4px_rgba(34,197,94,0.25)]", dot: "bg-bullish" },
    PUT:  { color: "text-bearish", bg: "bg-bearish/10",  border: "border-bearish/30",  glow: "shadow-[0_0_40px_-4px_rgba(239,68,68,0.25)]",  dot: "bg-bearish" },
    WAIT: { color: "text-neutral", bg: "bg-neutral/10",  border: "border-neutral/30",  glow: "shadow-[0_0_20px_-4px_rgba(245,158,11,0.15)]", dot: "bg-neutral" },
  }[signal.signal];

  const confidencePct = Math.round(signal.confidence);
  const confColor = confidencePct >= 70 ? "bg-bullish" : confidencePct >= 50 ? "bg-neutral" : "bg-bearish";

  const modeLabel = signal.mode === "intraday"
    ? "5-min bars · 0-1 DTE options"
    : "Daily bars · 3-7 DTE options · Enter ~3:45 PM EST";

  return (
    <div className={`rounded-2xl border ${cfg.border} ${cfg.glow} overflow-hidden`}>
      {/* Signal header */}
      <div className={`${cfg.bg} px-6 py-5`}>
        <div className="flex items-start justify-between flex-wrap gap-3">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-3">
              <span className={`w-4 h-4 rounded-full ${cfg.dot} ${signal.signal !== "WAIT" ? "animate-pulse" : ""}`} />
              <span className={`text-5xl font-black tracking-tight ${cfg.color}`}>{signal.signal}</span>
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-xs text-muted-foreground">{modeLabel}</span>
              {signal.mode === "intraday" && signal.nextBarIn != null && (
                <CountdownTimer seconds={signal.nextBarIn} />
              )}
              {signal.mode === "swing" && signal.targetDate && (
                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Calendar className="w-3 h-3" />
                  <span>BTST target: <span className="font-medium text-foreground">{signal.targetDate}</span></span>
                </div>
              )}
            </div>
          </div>
          <MarketStatusBadge status={signal.marketStatus} />
        </div>
      </div>

      {/* Score + confidence */}
      <div className="px-6 py-4 grid grid-cols-1 md:grid-cols-2 gap-5 border-b border-white/5">
        <div className="space-y-1.5">
          <div className="flex justify-between items-center">
            <span className="text-xs text-muted-foreground">Signal Strength</span>
            <span className="text-sm font-bold">{confidencePct}%</span>
          </div>
          <div className="h-2 bg-secondary/50 rounded-full overflow-hidden">
            <div className={`h-full rounded-full transition-all duration-700 ${confColor}`}
              style={{ width: `${confidencePct}%` }} />
          </div>
        </div>
        <ScoreBar score={signal.score} />
      </div>

      {/* Key factors */}
      {signal.keyFactors.length > 0 && (
        <div className="px-6 py-4 border-b border-white/5">
          <div className="text-xs font-bold text-muted-foreground tracking-widest mb-3 uppercase">Key Factors</div>
          <div className="space-y-2">
            {signal.keyFactors.slice(0, 5).map((factor, i) => {
              const isBull = factor.toLowerCase().includes("bullish") || factor.includes("above") || factor.includes("rising") || factor.includes("oversold") || factor.includes("positive") || factor.includes("upward");
              const isBear = factor.toLowerCase().includes("bearish") || factor.includes("below") || factor.includes("falling") || factor.includes("overbought") || factor.includes("negative") || factor.includes("downward") || factor.includes("expanding");
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
        </div>
      )}

      {/* Trade setup */}
      {signal.trade && (
        <div className="px-6 py-4 border-b border-white/5">
          <div className="text-xs font-bold text-muted-foreground tracking-widest mb-3 uppercase">Trade Setup</div>
          <TradePanel signal={signal} />
        </div>
      )}

      {/* Reasoning */}
      <div className="px-6 py-4 flex items-start gap-2 text-muted-foreground">
        <Info className="w-4 h-4 mt-0.5 flex-shrink-0 opacity-60" />
        <p className="text-sm italic opacity-75 leading-relaxed">{signal.reasoning}</p>
      </div>
    </div>
  );
}

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
    <div className="space-y-4">
      {/* Mode tabs */}
      <div className="flex items-center justify-between flex-wrap gap-3">
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

        <div className="text-xs text-muted-foreground bg-secondary/30 px-3 py-1.5 rounded-lg">
          {mode === "intraday" ? (
            <span>⚡ 5-min bars · ATM options · 0-1 DTE · Targets: +50% / +150% · Stop: −30%</span>
          ) : (
            <span>📈 Daily bars · Slightly OTM · 3-7 DTE · Targets: +100% / +300% · Stop: −50%</span>
          )}
        </div>
      </div>

      {/* Signal content */}
      <AnimatePresence mode="wait">
        {isLoading && !signal ? (
          <motion.div
            key="loading"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="h-[380px] rounded-2xl border border-white/5 bg-white/5 animate-pulse flex items-center justify-center"
          >
            <div className="text-muted-foreground text-sm">Analyzing {mode === "intraday" ? "5-min" : "daily"} bars...</div>
          </motion.div>
        ) : signal ? (
          <motion.div
            key={mode}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
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
            <p className="text-sm">Unable to load {mode} signal. The market may be closed or data unavailable.</p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
