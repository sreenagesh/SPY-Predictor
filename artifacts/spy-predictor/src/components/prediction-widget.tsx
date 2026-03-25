import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  TrendingUp, TrendingDown, Minus, Info, Calendar, RefreshCw,
  ChevronDown, ChevronUp, Target, Shield, ArrowUpRight, ArrowDownRight,
  AlertTriangle, CheckCircle2, Layers,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { SpyPredictionResponse, TradingSignalResponse } from "@workspace/api-client-react";

interface PredictionWidgetProps {
  prediction: SpyPredictionResponse;
  updatedAt?: string;
  swingSignal?: TradingSignalResponse;
}

// ─── Trend strength bar ───────────────────────────────────────────────────────

function TrendStrengthBar({ label, score, direction }: { label: string; score: number; direction: string }) {
  const clampedScore = Math.max(-100, Math.min(100, score));
  const pct = Math.abs(clampedScore) / 100;
  const color = direction === "bullish" ? "bg-bullish" : direction === "bearish" ? "bg-bearish" : "bg-neutral";
  const textColor = direction === "bullish" ? "text-bullish" : direction === "bearish" ? "text-bearish" : "text-neutral";

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className={`text-sm font-bold ${textColor}`}>{label}</span>
        <span className={`text-xs font-mono font-bold ${textColor}`}>
          {clampedScore > 0 ? "+" : ""}{clampedScore}
        </span>
      </div>
      <div className="relative h-2.5 bg-secondary/50 rounded-full overflow-hidden">
        <div className="absolute left-1/2 top-0 w-px h-full bg-white/20" />
        <div
          className={`absolute top-0 h-full rounded-full transition-all duration-700 ${color}`}
          style={{
            left: clampedScore >= 0 ? "50%" : `${50 - pct * 50}%`,
            width: `${pct * 50}%`,
          }}
        />
      </div>
      <div className="flex justify-between text-[9px] text-muted-foreground/40">
        <span>← Strong Bear</span>
        <span>Strong Bull →</span>
      </div>
    </div>
  );
}

// ─── Wyckoff phase badge ──────────────────────────────────────────────────────

function WyckoffBadge({ phase, bias }: { phase: string; bias: string }) {
  const cfg = {
    bullish: "bg-bullish/15 text-bullish border-bullish/30",
    bearish: "bg-bearish/15 text-bearish border-bearish/30",
    neutral: "bg-neutral/15 text-neutral border-neutral/30",
  }[bias] ?? "bg-white/5 text-muted-foreground border-white/10";

  return (
    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${cfg}`}>
      {phase}
    </span>
  );
}

// ─── Reversal level row ───────────────────────────────────────────────────────

function LevelRow({
  label, price, type, significance, currentPrice,
}: {
  label: string; price: number; type: "support" | "resistance"; significance: number; currentPrice: number;
}) {
  const isResistance = type === "resistance";
  const dist = Math.abs(((price - currentPrice) / currentPrice) * 100);
  return (
    <div className="flex items-center justify-between py-1.5 border-b border-white/3 last:border-0">
      <div className="flex items-center gap-2">
        <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded uppercase ${isResistance ? "bg-bearish/15 text-bearish" : "bg-bullish/15 text-bullish"}`}>
          {type.slice(0, 3).toUpperCase()}
        </span>
        <span className="text-xs text-muted-foreground">{label}</span>
        <div className="flex gap-0.5">
          {Array.from({ length: Math.min(significance, 5) }).map((_, i) => (
            <span key={i} className={`w-1 h-1 rounded-full ${isResistance ? "bg-bearish/60" : "bg-bullish/60"}`} />
          ))}
        </div>
      </div>
      <div className="flex items-center gap-2">
        <span className="text-[10px] text-muted-foreground/50">{dist.toFixed(1)}% away</span>
        <span className="font-mono text-xs font-bold text-foreground">${price.toFixed(2)}</span>
      </div>
    </div>
  );
}

// ─── Price targets card ───────────────────────────────────────────────────────

function TargetLevels({ targets, currentPrice }: {
  targets: { t1: number; t2: number; t3: number; direction: string };
  currentPrice: number;
}) {
  const isDown = targets.direction === "down";
  const isUp = targets.direction === "up";
  const Arrow = isDown ? ArrowDownRight : ArrowUpRight;
  const color = isDown ? "text-bearish" : isUp ? "text-bullish" : "text-neutral";
  const bg = isDown ? "bg-bearish/8 border-bearish/20" : isUp ? "bg-bullish/8 border-bullish/20" : "bg-white/5 border-white/10";

  const items = [
    { label: "T1", price: targets.t1, pct: ((targets.t1 - currentPrice) / currentPrice * 100) },
    { label: "T2", price: targets.t2, pct: ((targets.t2 - currentPrice) / currentPrice * 100) },
    { label: "T3", price: targets.t3, pct: ((targets.t3 - currentPrice) / currentPrice * 100) },
  ];

  return (
    <div className="grid grid-cols-3 gap-2">
      {items.map((item) => (
        <div key={item.label} className={`rounded-xl border ${bg} p-3 text-center`}>
          <div className="flex items-center justify-center gap-1 mb-1">
            <span className={`text-[9px] font-bold uppercase ${color}`}>{item.label}</span>
            <Arrow className={`w-2.5 h-2.5 ${color}`} />
          </div>
          <div className={`text-sm font-black font-mono ${color}`}>${item.price.toFixed(0)}</div>
          <div className={`text-[9px] font-mono mt-0.5 ${color} opacity-70`}>
            {item.pct > 0 ? "+" : ""}{item.pct.toFixed(1)}%
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Multi-timeframe conflict banner ──────────────────────────────────────────

function TimeframeConflictBanner({
  longTerm,
  shortTermSignal,
  wyckoffPhase,
  wyckoffBias,
}: {
  longTerm: "bullish" | "bearish" | "neutral";
  shortTermSignal: "CALL" | "PUT" | "WAIT" | undefined;
  wyckoffPhase: string;
  wyckoffBias: "bullish" | "bearish" | "neutral";
}) {
  if (!shortTermSignal || shortTermSignal === "WAIT") return null;

  const ltBullish = longTerm === "bullish";
  const stBullish = shortTermSignal === "CALL";
  const isConflict = ltBullish !== stBullish;

  const ltColor = ltBullish ? "text-bullish" : longTerm === "bearish" ? "text-bearish" : "text-neutral";
  const stColor = stBullish ? "text-bullish" : "text-bearish";
  const ltBg = ltBullish ? "bg-bullish/10 border-bullish/20" : longTerm === "bearish" ? "bg-bearish/10 border-bearish/20" : "bg-white/5 border-white/10";
  const stBg = stBullish ? "bg-bullish/10 border-bullish/20" : "bg-bearish/10 border-bearish/20";

  return (
    <div className="mx-4 mb-3">
      {/* Two-column timeframe comparison */}
      <div className="grid grid-cols-2 gap-2 mb-2">
        <div className={`rounded-xl border ${ltBg} p-3`}>
          <div className="text-[9px] font-bold text-muted-foreground/60 uppercase tracking-widest mb-1">
            Long-Term (Weeks)
          </div>
          <div className="text-[9px] text-muted-foreground/50 mb-1.5">200 SMA · Trend structure</div>
          <span className={`text-base font-black capitalize ${ltColor}`}>{longTerm}</span>
        </div>
        <div className={`rounded-xl border ${stBg} p-3`}>
          <div className="text-[9px] font-bold text-muted-foreground/60 uppercase tracking-widest mb-1">
            Short-Term (1–3 Days)
          </div>
          <div className="text-[9px] text-muted-foreground/50 mb-1.5">EMA · MACD · Momentum</div>
          <span className={`text-base font-black ${stColor}`}>{shortTermSignal}</span>
        </div>
      </div>

      {/* Conflict or alignment notice */}
      {isConflict ? (
        <div className="rounded-xl bg-amber-500/8 border border-amber-500/25 p-3 flex items-start gap-2">
          <AlertTriangle className="w-3.5 h-3.5 text-amber-400 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-[10px] font-bold text-amber-400 mb-1">Timeframe Conflict — Normal in {wyckoffPhase}</p>
            <p className="text-[10px] text-muted-foreground/70 leading-relaxed">
              The long-term trend is {longTerm} (SPY above 200 DMA) but short-term momentum says {shortTermSignal === "PUT" ? "sell" : "buy"}.
              This is common during {wyckoffPhase === "Distribution" ? "distribution phases — the primary trend is intact, but smart money is taking profits near-term, causing a pullback" :
                wyckoffPhase === "Accumulation" ? "accumulation phases — the long-term trend may be turning, but hasn't confirmed yet" :
                "consolidation — the market is digesting the prior move before resuming"}.
              {shortTermSignal === "PUT" && longTerm === "bullish"
                ? " Trading the PUT means trading the short-term pullback, not a trend reversal."
                : " Trading the CALL means trading a bounce within a larger downtrend — manage size accordingly."}
            </p>
          </div>
        </div>
      ) : (
        <div className="rounded-xl bg-bullish/5 border border-bullish/15 p-2.5 flex items-center gap-2">
          <CheckCircle2 className="w-3.5 h-3.5 text-bullish/70 flex-shrink-0" />
          <p className="text-[10px] text-muted-foreground/70">
            Both timeframes aligned — stronger conviction setup. Long-term trend and short-term momentum agree.
          </p>
        </div>
      )}
    </div>
  );
}

// ─── Main widget ──────────────────────────────────────────────────────────────

export function PredictionWidget({ prediction: pred, updatedAt, swingSignal }: PredictionWidgetProps) {
  const [showDetails, setShowDetails] = useState(false);
  const [showLevels, setShowLevels] = useState(true);

  const direction = pred.prediction;
  const isBullish = direction === "bullish";
  const isBearish = direction === "bearish";

  const Icon = isBullish ? TrendingUp : isBearish ? TrendingDown : Minus;
  const colorClass = isBullish ? "text-bullish" : isBearish ? "text-bearish" : "text-neutral";
  const bgGlow = isBullish
    ? "bg-bullish/8 shadow-[0_0_40px_rgba(22,163,74,0.15)] border-bullish/20"
    : isBearish
      ? "bg-bearish/8 shadow-[0_0_40px_rgba(225,29,72,0.15)] border-bearish/20"
      : "bg-neutral/8 shadow-[0_0_40px_rgba(245,158,11,0.10)] border-neutral/20";

  const updatedTime = updatedAt
    ? new Date(updatedAt).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })
    : null;

  const ts = pred.trendStrength;
  const wp = pred.wyckoffPhase;
  const ms = pred.marketStructure;

  return (
    <div className={`rounded-2xl border ${bgGlow} overflow-hidden`}>

      {/* ── Header ── */}
      <div className="px-5 pt-5 pb-3">
        <div className="flex items-start justify-between mb-3">
          <div>
            <div className="flex items-center gap-2 mb-0.5">
              <Layers className="w-3 h-3 text-muted-foreground/60" />
              <span className="text-xs font-bold text-muted-foreground uppercase tracking-widest">Multi-Timeframe Outlook</span>
            </div>
            <p className="text-[10px] text-muted-foreground/50 ml-5">Daily bars · Long-term structure · Not intraday</p>
          </div>
          <div className="flex flex-col items-end gap-1">
            <div className="flex items-center gap-1.5">
              <span className="text-[9px] text-muted-foreground/40 font-medium">WEEKS/MONTHS</span>
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${isBullish ? "bg-bullish/15 text-bullish border-bullish/30" : isBearish ? "bg-bearish/15 text-bearish border-bearish/30" : "bg-neutral/15 text-neutral border-neutral/30"}`}>
                DAILY
              </span>
            </div>
            {updatedTime && (
              <div className="flex items-center gap-1 text-[10px] text-muted-foreground/40">
                <RefreshCw className="w-2.5 h-2.5" />
                <span>{updatedTime}</span>
              </div>
            )}
          </div>
        </div>

        {/* Signal + Trend strength stacked */}
        <div className="flex items-center gap-3 mb-4">
          <Icon className={cn("w-7 h-7 flex-shrink-0", colorClass)} strokeWidth={2.5} />
          <div>
            <span className={cn("text-4xl font-black capitalize tracking-tight", colorClass)}>{direction}</span>
            <p className="text-[10px] text-muted-foreground/50 mt-0.5">Long-term trend bias</p>
          </div>
          <div className="flex-1" />
          <WyckoffBadge phase={wp.phase} bias={wp.bias} />
        </div>

        <TrendStrengthBar label={ts.label} score={ts.score} direction={ts.direction} />
      </div>

      {/* ── Multi-timeframe conflict/alignment panel ── */}
      <TimeframeConflictBanner
        longTerm={direction}
        shortTermSignal={swingSignal?.signal}
        wyckoffPhase={wp.phase}
        wyckoffBias={wp.bias}
      />

      {/* ── Wyckoff phase detail ── */}
      <div className="mx-4 mb-3 rounded-xl bg-white/3 border border-white/5 p-3">
        <div className="flex items-center gap-2 mb-1.5">
          <span className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground">Wyckoff · Hourly TF</span>
          <span className="text-[10px] text-muted-foreground/60">·</span>
          <span className="text-[10px] text-muted-foreground/80 font-medium">{wp.subPhase}</span>
        </div>
        <p className="text-xs text-muted-foreground/80 leading-relaxed">{wp.description}</p>
        <div className="mt-2 flex items-center gap-2">
          <span className="text-[9px] text-muted-foreground/40">Price position in range:</span>
          <div className="flex-1 h-1.5 bg-secondary/40 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full ${wp.bias === "bullish" ? "bg-bullish" : wp.bias === "bearish" ? "bg-bearish" : "bg-neutral"}`}
              style={{ width: `${Math.round(wp.pricePosition * 100)}%` }}
            />
          </div>
          <span className="text-[9px] text-muted-foreground/40">{Math.round(wp.pricePosition * 100)}%</span>
        </div>
      </div>

      {/* ── Price targets ── */}
      <div className="px-4 mb-3">
        <div className="flex items-center gap-2 mb-2">
          <Target className="w-3 h-3 text-muted-foreground/60" />
          <span className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground">
            {ms.targets.direction === "down" ? "Downside Targets" : ms.targets.direction === "up" ? "Upside Targets" : "Price Targets"}
          </span>
        </div>
        <TargetLevels targets={ms.targets} currentPrice={pred.currentPrice} />
      </div>

      {/* ── Key levels (collapsible) ── */}
      <div className="border-t border-white/5">
        <button
          onClick={() => setShowLevels(v => !v)}
          className="w-full flex items-center justify-between px-4 py-2.5 text-[10px] font-bold uppercase tracking-widest text-muted-foreground hover:text-foreground transition-colors"
        >
          <span className="flex items-center gap-2">
            <Shield className="w-3 h-3" />
            Key Reversal Levels ({ms.reversalLevels.length})
          </span>
          {showLevels ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
        </button>
        <AnimatePresence>
          {showLevels && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.22 }}
              className="overflow-hidden"
            >
              <div className="px-4 pb-3">
                {ms.nearestLevel && (
                  <div className="mb-2 text-[10px] text-muted-foreground/60 flex items-center gap-1.5">
                    <span>Nearest level:</span>
                    <span className={`font-bold ${ms.nearestLevel.type === "resistance" ? "text-bearish" : "text-bullish"}`}>
                      ${ms.nearestLevel.price.toFixed(2)} ({ms.nearestLevel.label})
                    </span>
                  </div>
                )}
                {ms.reversalLevels
                  .sort((a, b) => b.price - a.price)
                  .slice(0, 6)
                  .map((level, i) => (
                    <LevelRow
                      key={i}
                      {...level}
                      currentPrice={pred.currentPrice}
                    />
                  ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* ── Summary + indicator detail ── */}
      <div className="border-t border-white/5">
        <button
          onClick={() => setShowDetails(v => !v)}
          className="w-full flex items-center justify-between px-4 py-2.5 text-[10px] font-bold uppercase tracking-widest text-muted-foreground hover:text-foreground transition-colors"
        >
          <span className="flex items-center gap-2">
            <Info className="w-3 h-3" />
            Indicator Details ({pred.indicators.length})
          </span>
          {showDetails ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
        </button>
        <AnimatePresence>
          {showDetails && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.22 }}
              className="overflow-hidden"
            >
              <div className="px-4 pb-3 space-y-2">
                <p className="text-xs text-muted-foreground/80 leading-relaxed mb-3 flex items-start gap-2">
                  <Info className="w-3.5 h-3.5 mt-0.5 flex-shrink-0 text-primary/50" />
                  {pred.summary}
                </p>
                {pred.indicators.map((ind, i) => {
                  const sc = ind.signal === "bullish" ? "text-bullish" : ind.signal === "bearish" ? "text-bearish" : "text-muted-foreground";
                  const dot = ind.signal === "bullish" ? "bg-bullish" : ind.signal === "bearish" ? "bg-bearish" : "bg-neutral";
                  return (
                    <div key={i} className="flex items-start gap-2.5 py-1.5 border-b border-white/3 last:border-0">
                      <span className={`w-2 h-2 rounded-full mt-1 flex-shrink-0 ${dot}`} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs font-semibold text-foreground/80">{ind.name}</span>
                          <span className={`text-[10px] font-bold ${sc}`}>{ind.signal.toUpperCase()}</span>
                        </div>
                        <p className="text-[10px] text-muted-foreground/60 leading-snug mt-0.5">{ind.description}</p>
                      </div>
                    </div>
                  );
                })}
                <p className="text-[9px] text-muted-foreground/30 pt-1">
                  Uses weighted scoring: Price/200SMA (30%), SMA Stack (25%), MACD (20%), 50/200 Cross (15%), RSI (10%)
                </p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
