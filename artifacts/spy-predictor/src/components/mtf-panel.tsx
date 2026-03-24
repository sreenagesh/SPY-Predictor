import React from "react";
import { motion } from "framer-motion";
import {
  TrendingUp, TrendingDown, Minus, Clock, AlertTriangle,
  CheckCircle, XCircle, BarChart2, Target, Layers, Zap,
  ChevronRight, Info,
} from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import type { MtfAnalysisResponse, TimeframeSnapshot } from "@workspace/api-client-react";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function trendColor(trend: string) {
  if (trend === "bullish") return "text-bullish";
  if (trend === "bearish") return "text-bearish";
  return "text-neutral";
}

function trendIcon(trend: string, className = "w-4 h-4") {
  if (trend === "bullish") return <TrendingUp className={`${className} text-bullish`} />;
  if (trend === "bearish") return <TrendingDown className={`${className} text-bearish`} />;
  return <Minus className={`${className} text-neutral`} />;
}

function ScoreMiniBar({ score }: { score: number }) {
  const clamped = Math.max(-100, Math.min(100, score));
  const pct = Math.abs(clamped) / 100;
  const color = clamped > 0 ? "#22c55e" : clamped < 0 ? "#ef4444" : "#f59e0b";
  const label = clamped > 0 ? `+${clamped}` : `${clamped}`;
  const textColor = clamped > 0 ? "text-bullish" : clamped < 0 ? "text-bearish" : "text-neutral";
  return (
    <div className="space-y-1">
      <div className="flex justify-between">
        <span className="text-[10px] text-muted-foreground">Momentum</span>
        <span className={`text-xs font-mono font-bold ${textColor}`}>{label}</span>
      </div>
      <div className="relative h-1.5 bg-secondary/50 rounded-full overflow-hidden">
        <div className="absolute left-1/2 top-0 w-px h-full bg-white/10" />
        <div
          className="absolute top-0 h-full rounded-full"
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

// ─── Per-timeframe card ───────────────────────────────────────────────────────

function TfCard({ snap, label }: { snap: TimeframeSnapshot; label: string }) {
  const border = snap.trend === "bullish" ? "border-bullish/20" : snap.trend === "bearish" ? "border-bearish/20" : "border-white/8";
  const bg     = snap.trend === "bullish" ? "bg-bullish/5"      : snap.trend === "bearish" ? "bg-bearish/5"      : "bg-white/3";

  return (
    <div className={`rounded-xl border ${border} ${bg} p-4 flex flex-col gap-3`}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-xs font-black font-mono tracking-widest text-muted-foreground/60 bg-secondary/40 px-2 py-0.5 rounded">
            {label}
          </span>
          <div className="flex items-center gap-1">
            {trendIcon(snap.trend)}
            <span className={`text-sm font-bold capitalize ${trendColor(snap.trend)}`}>
              {snap.trend}
            </span>
          </div>
        </div>
        <span className="text-[10px] text-muted-foreground">ATR {snap.atr.toFixed(2)}</span>
      </div>

      {/* Score bar */}
      <ScoreMiniBar score={snap.score} />

      {/* Key indicators grid */}
      <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
        <div className="flex justify-between">
          <span className="text-muted-foreground">EMA8</span>
          <span className="font-mono">{snap.ema8.toFixed(2)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">EMA21</span>
          <span className="font-mono">{snap.ema21.toFixed(2)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">RSI</span>
          <span className={`font-mono font-bold ${snap.rsi > 68 ? "text-bearish" : snap.rsi < 32 ? "text-bullish" : "text-foreground"}`}>
            {snap.rsi.toFixed(1)}
          </span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">MACD Hist</span>
          <span className={`font-mono ${snap.macdHistogram > 0 ? "text-bullish" : "text-bearish"}`}>
            {snap.macdHistogram > 0 ? "+" : ""}{snap.macdHistogram.toFixed(3)}
            <span className="text-[9px] ml-0.5 opacity-60">{snap.macdSlope === "up" ? "↑" : "↓"}</span>
          </span>
        </div>
        <div className="flex justify-between col-span-2">
          <span className="text-muted-foreground">EMA Trend</span>
          <span className={`font-medium ${snap.emaAligned ? "text-bullish" : "text-bearish"}`}>
            {snap.emaAligned ? "EMA8 > EMA21 (Bull)" : "EMA8 < EMA21 (Bear)"}
          </span>
        </div>
      </div>

      {/* Key factor */}
      <p className="text-[11px] text-muted-foreground/70 leading-snug italic border-t border-white/5 pt-2">
        {snap.keyFactor}
      </p>
    </div>
  );
}

// ─── Alignment gauge ──────────────────────────────────────────────────────────

function AlignmentGauge({ score, direction, label, confidence }: {
  score: number; direction: string; label: string; confidence: number;
}) {
  const votes = [-3, -2, -1, 0, 1, 2, 3];
  const color = direction === "bullish" ? "#22c55e" : direction === "bearish" ? "#ef4444" : "#f59e0b";
  const textColor = direction === "bullish" ? "text-bullish" : direction === "bearish" ? "text-bearish" : "text-neutral";
  const Icon = direction === "bullish" ? TrendingUp : direction === "bearish" ? TrendingDown : Minus;

  return (
    <div className="rounded-xl border border-white/8 bg-background/40 p-5">
      <div className="flex items-center gap-2 mb-4">
        <Layers className="w-4 h-4 text-muted-foreground" />
        <span className="text-xs font-bold tracking-widest text-muted-foreground uppercase">MTF Alignment</span>
      </div>

      {/* Visual vote display */}
      <div className="flex items-center justify-center gap-3 mb-4">
        {votes.map(v => {
          const isActive = direction === "bullish" ? v > 0 && v <= score : direction === "bearish" ? v < 0 && v >= score : v === 0;
          const isPivot = v === 0;
          return (
            <div key={v} className={`w-3 h-8 rounded-sm transition-all ${isPivot ? "bg-white/10" : isActive ? "opacity-100" : "opacity-15"}`}
              style={{ backgroundColor: isActive ? color : undefined }} />
          );
        })}
      </div>

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Icon className={`w-5 h-5 ${textColor}`} />
          <div>
            <p className={`text-sm font-bold ${textColor}`}>{label}</p>
            <p className="text-xs text-muted-foreground">Confidence {confidence}%</p>
          </div>
        </div>
        <div className="text-right">
          <span className={`text-3xl font-black font-mono ${textColor}`}>
            {score > 0 ? `+${score}` : score}
          </span>
          <span className="text-xs text-muted-foreground block">/ ±3</span>
        </div>
      </div>
    </div>
  );
}

// ─── Entry window banner ──────────────────────────────────────────────────────

function EntryWindowBanner({ window: w }: { window: MtfAnalysisResponse["zeroDTE"]["entryWindow"] }) {
  const { name, isOptimal, isCaution, isDanger, minutesLeft, advice } = w;

  const cfg = isDanger  ? { bg: "bg-destructive/10",  border: "border-destructive/30",  icon: <XCircle className="w-4 h-4 text-destructive flex-shrink-0" />, label: "DANGER" } :
              isCaution ? { bg: "bg-amber-500/10",     border: "border-amber-500/30",    icon: <AlertTriangle className="w-4 h-4 text-amber-400 flex-shrink-0" />, label: "CAUTION" } :
              isOptimal ? { bg: "bg-bullish/10",       border: "border-bullish/30",      icon: <CheckCircle className="w-4 h-4 text-bullish flex-shrink-0" />, label: "PRIME WINDOW" } :
                          { bg: "bg-white/4",          border: "border-white/8",         icon: <Clock className="w-4 h-4 text-muted-foreground flex-shrink-0" />, label: "" };

  return (
    <div className={`rounded-xl border ${cfg.border} ${cfg.bg} p-4 flex flex-col gap-2`}>
      <div className="flex items-center gap-2">
        {cfg.icon}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-sm text-foreground">{name}</span>
            {cfg.label && (
              <span className={`text-[10px] font-bold tracking-wider px-1.5 py-0.5 rounded
                ${isDanger ? "bg-destructive/20 text-destructive" :
                  isCaution ? "bg-amber-500/20 text-amber-400" :
                  isOptimal ? "bg-bullish/20 text-bullish" : ""}
              `}>{cfg.label}</span>
            )}
          </div>
        </div>
        {minutesLeft != null && (
          <span className="text-xs font-mono text-muted-foreground flex-shrink-0">
            {minutesLeft >= 60
              ? `${Math.floor(minutesLeft / 60)}h ${minutesLeft % 60}m left`
              : `${minutesLeft}m left`}
          </span>
        )}
      </div>
      <p className="text-xs text-muted-foreground leading-relaxed">{advice}</p>
    </div>
  );
}

// ─── 0DTE Intelligence panel ──────────────────────────────────────────────────

function ZeroDtePanel({ z, currentPrice }: {
  z: MtfAnalysisResponse["zeroDTE"];
  currentPrice: number;
}) {
  const qualityConfig = {
    High:  { color: "text-bullish",    bg: "bg-bullish/10",   border: "border-bullish/30" },
    Medium:{ color: "text-blue-400",   bg: "bg-blue-400/10",  border: "border-blue-400/30" },
    Low:   { color: "text-neutral",    bg: "bg-neutral/10",   border: "border-neutral/30" },
    Avoid: { color: "text-destructive",bg: "bg-destructive/10",border: "border-destructive/30" },
  }[z.entryQuality];

  const riskConfig = {
    Low:     { color: "text-bullish",    dot: "bg-bullish" },
    Medium:  { color: "text-blue-400",   dot: "bg-blue-400" },
    High:    { color: "text-neutral",    dot: "bg-neutral" },
    Extreme: { color: "text-destructive",dot: "bg-destructive" },
  }[z.riskRating];

  const accelConfig = {
    accelerating: { label: "Accelerating ▲", color: "text-bullish" },
    steady:       { label: "Steady →",        color: "text-muted-foreground" },
    fading:       { label: "Fading ▼",        color: "text-neutral" },
  }[z.momentumAcceleration];

  const sideColor = z.suggestedSide === "CALL" ? "text-bullish" : z.suggestedSide === "PUT" ? "text-bearish" : "text-neutral";

  return (
    <div className="space-y-4">
      {/* Entry Quality + Side Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className={`col-span-1 rounded-xl border ${qualityConfig.border} ${qualityConfig.bg} p-3 flex flex-col gap-1`}>
          <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Entry Quality</span>
          <span className={`text-xl font-black ${qualityConfig.color}`}>{z.entryQuality}</span>
        </div>
        <div className="col-span-1 rounded-xl border border-white/8 bg-background/40 p-3 flex flex-col gap-1">
          <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Suggested</span>
          <span className={`text-xl font-black ${sideColor}`}>{z.suggestedSide}</span>
        </div>
        <div className="col-span-1 rounded-xl border border-white/8 bg-background/40 p-3 flex flex-col gap-1">
          <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Risk Rating</span>
          <div className="flex items-center gap-1.5">
            <span className={`w-2 h-2 rounded-full flex-shrink-0 ${riskConfig.dot}`} />
            <span className={`text-base font-bold ${riskConfig.color}`}>{z.riskRating}</span>
          </div>
        </div>
        <div className="col-span-1 rounded-xl border border-white/8 bg-background/40 p-3 flex flex-col gap-1">
          <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Momentum</span>
          <span className={`text-base font-bold ${accelConfig.color}`}>{accelConfig.label}</span>
        </div>
      </div>

      {/* Entry Window */}
      <EntryWindowBanner window={z.entryWindow} />

      {/* Session Levels + Pivots side by side */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {/* Session Levels */}
        <div className="rounded-xl border border-white/8 bg-background/40 overflow-hidden">
          <div className="px-4 py-2.5 bg-white/4 flex items-center gap-2">
            <BarChart2 className="w-3.5 h-3.5 text-muted-foreground" />
            <span className="text-xs font-bold tracking-wide text-muted-foreground uppercase">Session Levels</span>
          </div>
          <div className="p-4 space-y-2">
            {[
              { label: "Today Open",   val: z.sessionLevels.todayOpen,   isRef: true },
              { label: "Session High", val: z.sessionLevels.sessionHigh, isHigh: true },
              { label: "Current",      val: currentPrice,                 isCurrent: true },
              { label: "Session Low",  val: z.sessionLevels.sessionLow,  isLow: true },
              ...(z.sessionLevels.preMarketHigh != null ? [{ label: "PM High", val: z.sessionLevels.preMarketHigh, isPm: true }] : []),
              ...(z.sessionLevels.preMarketLow  != null ? [{ label: "PM Low",  val: z.sessionLevels.preMarketLow,  isPm: true }] : []),
            ].map((row, i) => (
              <div key={i} className="flex justify-between items-center text-xs">
                <span className={`text-muted-foreground ${(row as any).isCurrent ? "font-bold text-foreground" : ""}`}>{row.label}</span>
                <span className={`font-mono font-bold
                  ${(row as any).isCurrent ? "text-foreground" :
                    (row as any).isHigh ? "text-bullish/80" :
                    (row as any).isLow  ? "text-bearish/80" :
                    (row as any).isPm   ? "text-muted-foreground" : "text-foreground/60"}
                `}>{formatCurrency(row.val)}</span>
              </div>
            ))}
            <div className="flex justify-between pt-1 border-t border-white/5 text-xs">
              <span className="text-muted-foreground">Dist to High</span>
              <span className="font-mono text-bullish">+{formatCurrency(z.sessionLevels.distToHigh)}</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-muted-foreground">Dist to Low</span>
              <span className="font-mono text-bearish">-{formatCurrency(z.sessionLevels.distToLow)}</span>
            </div>
          </div>
        </div>

        {/* Pivot levels */}
        <div className="rounded-xl border border-white/8 bg-background/40 overflow-hidden">
          <div className="px-4 py-2.5 bg-white/4 flex items-center gap-2">
            <Target className="w-3.5 h-3.5 text-muted-foreground" />
            <span className="text-xs font-bold tracking-wide text-muted-foreground uppercase">15-Min Pivots</span>
          </div>
          <div className="p-4 space-y-2">
            {z.pivots.resistance.length === 0 && z.pivots.support.length === 0 && (
              <p className="text-xs text-muted-foreground italic">Insufficient intraday data for pivot detection.</p>
            )}
            {z.pivots.resistance.slice(0, 3).map((r, i) => (
              <div key={`r${i}`} className="flex justify-between items-center text-xs">
                <span className="text-muted-foreground flex items-center gap-1">
                  <span className="text-bullish text-[9px]">▲</span> Resistance {i + 1}
                </span>
                <span className="font-mono font-bold text-bullish/80">{formatCurrency(r)}</span>
              </div>
            ))}
            {z.pivots.resistance.length > 0 && z.pivots.support.length > 0 && (
              <div className="flex justify-between items-center py-0.5 text-xs border-y border-white/5 my-1">
                <span className="text-muted-foreground/60">— Current —</span>
                <span className="font-mono text-foreground/60">{formatCurrency(currentPrice)}</span>
              </div>
            )}
            {z.pivots.support.slice(0, 3).map((s, i) => (
              <div key={`s${i}`} className="flex justify-between items-center text-xs">
                <span className="text-muted-foreground flex items-center gap-1">
                  <span className="text-bearish text-[9px]">▼</span> Support {i + 1}
                </span>
                <span className="font-mono font-bold text-bearish/80">{formatCurrency(s)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Volume + IV proxy row */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <div className="rounded-xl border border-white/8 bg-background/40 p-4 col-span-2 md:col-span-1">
          <div className="flex items-center gap-2 mb-2">
            <BarChart2 className="w-3.5 h-3.5 text-muted-foreground" />
            <span className="text-xs font-bold text-muted-foreground uppercase tracking-wide">Volume</span>
          </div>
          <div className="flex items-baseline gap-1 mb-1">
            <span className={`text-2xl font-mono font-black ${z.volumeContext.expanding ? "text-bullish" : "text-neutral"}`}>
              {z.volumeContext.relative}×
            </span>
            <span className="text-xs text-muted-foreground">avg</span>
          </div>
          <p className="text-[11px] text-muted-foreground leading-snug">{z.volumeContext.label}</p>
        </div>
        <div className="rounded-xl border border-white/8 bg-background/40 p-4">
          <div className="flex items-center gap-2 mb-2">
            <Zap className="w-3.5 h-3.5 text-muted-foreground" />
            <span className="text-xs font-bold text-muted-foreground uppercase tracking-wide">IV Proxy</span>
          </div>
          <div className="flex items-baseline gap-1 mb-1">
            <span className="text-2xl font-mono font-black text-foreground">{z.vixProxy.toFixed(1)}</span>
            <span className="text-xs text-muted-foreground">%</span>
          </div>
          <p className="text-[11px] text-muted-foreground">Annualized vol estimate</p>
        </div>
        <div className="rounded-xl border border-white/8 bg-background/40 p-4">
          <div className="flex items-center gap-2 mb-2">
            <Target className="w-3.5 h-3.5 text-muted-foreground" />
            <span className="text-xs font-bold text-muted-foreground uppercase tracking-wide">Expected Move</span>
          </div>
          <div className="flex items-baseline gap-1 mb-1">
            <span className="text-2xl font-mono font-black text-foreground">±{formatCurrency(z.expectedMove)}</span>
          </div>
          <p className="text-[11px] text-muted-foreground">Estimated daily range (1σ)</p>
        </div>
      </div>

      {/* Trading Advice */}
      {z.tradingAdvice.length > 0 && (
        <div className="rounded-xl border border-white/8 bg-background/40 overflow-hidden">
          <div className="px-4 py-2.5 bg-white/4 flex items-center gap-2">
            <Info className="w-3.5 h-3.5 text-muted-foreground" />
            <span className="text-xs font-bold tracking-wide text-muted-foreground uppercase">0DTE Advice</span>
          </div>
          <div className="p-4 space-y-2.5">
            {z.tradingAdvice.map((advice, i) => (
              <div key={i} className="flex items-start gap-2.5 text-sm">
                <ChevronRight className="w-3.5 h-3.5 mt-0.5 text-muted-foreground/60 flex-shrink-0" />
                <span className="text-muted-foreground leading-snug">{advice}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main export ──────────────────────────────────────────────────────────────

interface MtfPanelProps {
  data: MtfAnalysisResponse | undefined;
  isLoading: boolean;
}

export function MtfPanel({ data, isLoading }: MtfPanelProps) {
  if (isLoading && !data) {
    return (
      <div className="space-y-4">
        {[1, 2, 3].map(i => (
          <div key={i} className="h-40 rounded-2xl border border-white/5 bg-white/4 animate-pulse" />
        ))}
      </div>
    );
  }

  if (!data) {
    return (
      <div className="rounded-2xl border border-white/8 bg-destructive/5 p-6 text-center text-muted-foreground text-sm">
        Multi-timeframe analysis unavailable. API may be loading or market data is delayed.
      </div>
    );
  }

  const tfs = data.timeframes;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="space-y-6"
    >
      {/* Section header */}
      <div className="flex items-center gap-3">
        <div className="h-px flex-1 bg-white/5" />
        <span className="text-xs font-bold tracking-widest text-muted-foreground uppercase">Multi-Timeframe Analysis</span>
        <div className="h-px flex-1 bg-white/5" />
      </div>

      {/* MTF Alignment gauge */}
      <AlignmentGauge
        score={data.alignment.score}
        direction={data.alignment.direction}
        label={data.alignment.label}
        confidence={data.alignment.confidence}
      />

      {/* 3 timeframe cards in a row */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <TfCard snap={tfs["5m"]}  label="5 MIN" />
        <TfCard snap={tfs["15m"]} label="15 MIN" />
        <TfCard snap={tfs["1h"]}  label="1 HOUR" />
      </div>

      {/* 0DTE Intelligence */}
      <div className="flex items-center gap-3">
        <div className="h-px flex-1 bg-white/5" />
        <span className="text-xs font-bold tracking-widest text-muted-foreground uppercase">0DTE Intelligence</span>
        <div className="h-px flex-1 bg-white/5" />
      </div>

      <ZeroDtePanel z={data.zeroDTE} currentPrice={data.currentPrice} />
    </motion.div>
  );
}
