import React from "react";
import { motion } from "framer-motion";
import {
  MessageSquare, TrendingUp, TrendingDown, Minus, AlertTriangle,
  CheckCircle, Clock, Activity, Ban, TrendingDown as TrendDown,
} from "lucide-react";

interface MtfTf {
  tf: string; score: number; trend: string;
  ema8: number; ema21: number; rsi: number;
  macdHistogram: number; macdSlope: string; atr?: number;
}
interface MtfData {
  currentPrice: number;
  timeframes: { "5m": MtfTf; "15m": MtfTf; "1h": MtfTf };
  alignment: { score: number; direction: string; label: string; confidence: number };
  zeroDTE: {
    entryQuality: string; suggestedSide: string; riskRating: string;
    entryWindow: { name: string; isOptimal: boolean; isCaution: boolean; isDanger: boolean; advice: string; minutesLeft: number };
    sessionLevels: { todayOpen: number; sessionHigh: number; sessionLow: number; preMarketHigh: number; preMarketLow: number };
    pivots: { support: number[]; resistance: number[] };
    volumeContext: { relative: number; label: string; expanding: boolean };
    vixProxy: number; expectedMove: number; tradingAdvice: string[];
    momentumAcceleration: string;
  };
}
interface IntradaySignal {
  signal: string; confidence: number; score: number;
  currentPrice: number; marketStatus: string;
  reasoning?: string; keyFactors?: string[];
  // New fields from updated signal engine
  rsi?: number; rsiRegime?: string; rsiWarning?: string;
  extendedMove?: { sessionsSinceTrend: number; trendDirection: string; totalMovePercent: number };
  trade?: { strike: number; expiration: string; daysToExpiry: number };
}
interface SwingSignal {
  signal: string; confidence: number; score: number; currentPrice: number;
  wyckoff?: { phase: string; bias: string };
  trade?: { strike: number; expiration: string; daysToExpiry: number };
}
interface Props {
  mtfData?: MtfData | null;
  intradaySignal?: IntradaySignal | null;
  swingSignal?: SwingSignal | null;
  isLoading?: boolean;
}

// ─── helpers ─────────────────────────────────────────────────────────────────
function rsiLabel(rsi: number): { text: string; color: string } {
  if (rsi >= 80) return { text: `RSI ${rsi.toFixed(0)} — extremely overbought, reversal risk`,     color: "text-bearish" };
  if (rsi >= 70) return { text: `RSI ${rsi.toFixed(0)} — overbought, watch for fade`,              color: "text-orange-400" };
  if (rsi >= 55) return { text: `RSI ${rsi.toFixed(0)} — bullish momentum`,                        color: "text-bullish" };
  if (rsi >= 45) return { text: `RSI ${rsi.toFixed(0)} — neutral zone, no edge`,                   color: "text-muted-foreground" };
  if (rsi >= 30) return { text: `RSI ${rsi.toFixed(0)} — oversold, watch for bounce`,              color: "text-orange-400" };
  return           { text: `RSI ${rsi.toFixed(0)} — deeply oversold, high-probability bounce zone`, color: "text-bullish" };
}
function macdLabel(hist: number, slope: string): { text: string; color: string } {
  const dir = slope === "up" ? "↑ turning up" : slope === "down" ? "↓ turning down" : "flat";
  if (hist >  0.5) return { text: `MACD +${hist.toFixed(2)} (${dir}) — strong bullish momentum`, color: "text-bullish" };
  if (hist >  0)   return { text: `MACD +${hist.toFixed(2)} (${dir}) — mild bullish`,            color: "text-bullish/80" };
  if (hist < -0.5) return { text: `MACD ${hist.toFixed(2)} (${dir}) — strong bearish momentum`,  color: "text-bearish" };
  if (hist <  0)   return { text: `MACD ${hist.toFixed(2)} (${dir}) — mild bearish`,             color: "text-bearish/80" };
  return             { text: `MACD ~0 (${dir}) — no momentum`,                                   color: "text-muted-foreground" };
}
function volLabel(rel: number, expanding: boolean): { text: string; color: string } {
  const pct = Math.round(rel * 100);
  const exp  = expanding ? "expanding" : "contracting";
  if (rel >= 2.0) return { text: `Volume ${pct}% of avg (${exp}) — very high conviction move`,      color: "text-bullish" };
  if (rel >= 1.3) return { text: `Volume ${pct}% of avg (${exp}) — above average, good conviction`, color: "text-bullish/80" };
  if (rel >= 0.8) return { text: `Volume ${pct}% of avg (${exp}) — normal flow`,                   color: "text-muted-foreground" };
  return           { text: `Volume ${pct}% of avg (${exp}) — thin, low conviction`,                 color: "text-orange-400" };
}

function SignalIcon({ signal }: { signal: string }) {
  if (signal === "CALL") return <TrendingUp   className="w-4 h-4 text-bullish" />;
  if (signal === "PUT")  return <TrendingDown  className="w-4 h-4 text-bearish" />;
  return                        <Minus         className="w-4 h-4 text-muted-foreground" />;
}
function Pill({ children, color }: { children: React.ReactNode; color: string }) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border ${color}`}>
      {children}
    </span>
  );
}

// ─── RSI / Extended Move Alert (NEW) ─────────────────────────────────────────
function RsiAlertInline({
  rsiWarning, rsiRegime, rsi, extendedMove,
}: {
  rsiWarning?: string | null;
  rsiRegime?:  string | null;
  rsi?:        number | null;
  extendedMove?: { sessionsSinceTrend: number; trendDirection: string; totalMovePercent: number } | null;
}) {
  const isBlocked = rsiRegime === "deeply_oversold" || rsiRegime === "deeply_overbought";
  const showRsi   = !!rsiWarning;
  const showMove  = !!extendedMove && extendedMove.sessionsSinceTrend >= 2 && !showRsi;

  if (!showRsi && !showMove) return null;

  if (showRsi) {
    return (
      <div className={`rounded-xl p-3 border text-xs flex items-start gap-2 ${
        isBlocked
          ? "bg-red-500/10 border-red-500/25"
          : "bg-amber-500/8 border-amber-500/22"
      }`}>
        {isBlocked
          ? <Ban          className="w-3.5 h-3.5 mt-0.5 flex-shrink-0 text-red-400" />
          : <AlertTriangle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0 text-amber-400" />
        }
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className={`text-[9px] font-black tracking-widest ${isBlocked ? "text-red-400" : "text-amber-400"}`}>
              {isBlocked ? "SIGNAL BLOCKED" : "RSI CAUTION"}
            </span>
            {rsi != null && (
              <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full border ${
                isBlocked ? "bg-red-500/15 border-red-500/30 text-red-400" : "bg-amber-500/15 border-amber-500/30 text-amber-400"
              }`}>RSI {rsi.toFixed(1)}</span>
            )}
          </div>
          <p className="text-muted-foreground/80 leading-relaxed">{rsiWarning}</p>
        </div>
      </div>
    );
  }

  // Extended move only
  const { sessionsSinceTrend, trendDirection, totalMovePercent } = extendedMove!;
  return (
    <div className="rounded-xl p-3 border border-orange-500/22 bg-orange-500/7 text-xs flex items-start gap-2">
      <TrendDown className="w-3.5 h-3.5 mt-0.5 flex-shrink-0 text-orange-400" />
      <div>
        <span className="text-[9px] font-black tracking-widest text-orange-400">EXTENDED MOVE — Day {sessionsSinceTrend}</span>
        <p className="text-muted-foreground/80 leading-relaxed mt-1">
          SPY has been {trendDirection} for {sessionsSinceTrend} sessions ({Math.abs(totalMovePercent).toFixed(1)}% total).
          Chasing {trendDirection === "bearish" ? "PUTs" : "CALLs"} on Day {sessionsSinceTrend} carries elevated reversal risk.
        </p>
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────
export function MarketCommentary({ mtfData, intradaySignal, swingSignal, isLoading }: Props) {
  if (isLoading || (!mtfData && !intradaySignal)) {
    return (
      <div className="glass-panel rounded-2xl p-4 animate-pulse">
        <div className="h-4 bg-muted/30 rounded w-48 mb-3" />
        <div className="space-y-2">
          {[1, 2, 3].map(i => <div key={i} className="h-3 bg-muted/20 rounded w-full" />)}
        </div>
      </div>
    );
  }

  const tf5   = mtfData?.timeframes["5m"];
  const tf15  = mtfData?.timeframes["15m"];
  const tf1h  = mtfData?.timeframes["1h"];
  const z     = mtfData?.zeroDTE;
  const align = mtfData?.alignment;

  const price        = intradaySignal?.currentPrice ?? mtfData?.currentPrice ?? 0;
  const intraSignal  = intradaySignal?.signal ?? "WAIT";
  const swingDir     = swingSignal?.signal ?? "WAIT";
  const isMarketOpen = intradaySignal?.marketStatus === "open";

  const overallBullish = align?.direction === "bullish";
  const overallBearish = align?.direction === "bearish";

  const qualityColor = z?.entryQuality === "High"
    ? "border-bullish/40 text-bullish bg-bullish/5"
    : z?.entryQuality === "Medium"
    ? "border-orange-400/40 text-orange-400 bg-orange-400/5"
    : "border-muted/40 text-muted-foreground bg-muted/5";

  const suggestedSide = z?.suggestedSide ?? intraSignal;
  const actionBullish = suggestedSide === "CALL";
  const actionBearish = suggestedSide === "PUT";

  const support       = z?.pivots?.support     ?? [];
  const resistance    = z?.pivots?.resistance  ?? [];
  const nearestSupport = support[0];
  const nearestResist  = resistance[0];
  const vix            = z?.vixProxy;
  const expMove        = z?.expectedMove;

  // RSI / extended move from intraday signal engine (new fields)
  const rsiWarning   = intradaySignal?.rsiWarning   ?? null;
  const rsiRegime    = intradaySignal?.rsiRegime     ?? null;
  const rsi          = intradaySignal?.rsi           ?? null;
  const extendedMove = intradaySignal?.extendedMove  ?? null;

  return (
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="glass-panel rounded-2xl overflow-hidden"
    >
      {/* Header */}
      <div className="px-4 py-3 border-b border-white/5 flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <MessageSquare className="w-4 h-4 text-primary/70" />
          <span className="text-sm font-semibold text-foreground/90 tracking-wide">Market Commentary</span>
          <span className="text-[10px] text-muted-foreground/50">· auto-updated with signals</span>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {z?.entryQuality && (
            <Pill color={qualityColor}>{z.entryQuality} Entry</Pill>
          )}
          {z?.riskRating && (
            <Pill color={z.riskRating === "High"
              ? "border-bearish/40 text-bearish bg-bearish/5"
              : z.riskRating === "Medium"
              ? "border-orange-400/40 text-orange-400 bg-orange-400/5"
              : "border-bullish/40 text-bullish bg-bullish/5"
            }>{z.riskRating} Risk</Pill>
          )}
          {isMarketOpen ? (
            <Pill color="border-bullish/40 text-bullish bg-bullish/5">
              <span className="w-1 h-1 rounded-full bg-bullish mr-1 animate-pulse inline-block" /> Market Open
            </Pill>
          ) : (
            <Pill color="border-muted/30 text-muted-foreground bg-muted/5">Market Closed</Pill>
          )}
        </div>
      </div>

      <div className="p-4 grid grid-cols-1 lg:grid-cols-3 gap-4">

        {/* ── Col 1: Situation ── */}
        <div className="space-y-3">
          <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/50 mb-1">Current Situation</div>

          {/* ── RSI/Extended Move Alert (NEW — top of situation col) ── */}
          <RsiAlertInline
            rsiWarning={rsiWarning}
            rsiRegime={rsiRegime}
            rsi={rsi}
            extendedMove={extendedMove}
          />

          {/* Action suggestion */}
          <div className={`rounded-xl p-3 border ${actionBullish ? "bg-bullish/5 border-bullish/20" : actionBearish ? "bg-bearish/5 border-bearish/20" : "bg-muted/5 border-muted/15"}`}>
            <div className="flex items-center gap-2 mb-1">
              <SignalIcon signal={suggestedSide} />
              <span className={`text-sm font-bold ${actionBullish ? "text-bullish" : actionBearish ? "text-bearish" : "text-muted-foreground"}`}>
                {suggestedSide === "CALL" ? "Buy CALL — Bullish Setup"
                  : suggestedSide === "PUT" ? "Buy PUT — Bearish Setup"
                  : "Wait — No Clear Edge"}
              </span>
            </div>
            <p className="text-xs text-muted-foreground/80 leading-relaxed">
              {align?.label ?? "Timeframes are mixed. No high-conviction trade right now."}
            </p>
          </div>

          {/* Time window */}
          {z?.entryWindow && (
            <div className={`rounded-xl p-3 border text-xs ${
              z.entryWindow.isOptimal ? "bg-bullish/5 border-bullish/20"
              : z.entryWindow.isDanger ? "bg-bearish/5 border-bearish/20"
              : z.entryWindow.isCaution ? "bg-orange-400/5 border-orange-400/20"
              : "bg-muted/5 border-muted/15"
            }`}>
              <div className="flex items-center gap-1.5 mb-1">
                <Clock className={`w-3 h-3 ${z.entryWindow.isOptimal ? "text-bullish" : z.entryWindow.isDanger ? "text-bearish" : "text-orange-400"}`} />
                <span className="font-semibold text-foreground/80">{z.entryWindow.name}</span>
                {z.entryWindow.minutesLeft > 0 && (
                  <span className="text-muted-foreground/50">{z.entryWindow.minutesLeft}min left</span>
                )}
              </div>
              <p className="text-muted-foreground/75 leading-relaxed">{z.entryWindow.advice}</p>
            </div>
          )}

          {/* Signal snapshot */}
          <div className="rounded-xl p-3 border border-white/5 bg-white/[0.02] text-xs space-y-1">
            <div className="font-semibold text-foreground/70 mb-1.5">Signal Snapshot</div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground/70">Intraday (0DTE)</span>
              <div className="flex items-center gap-1.5">
                <SignalIcon signal={intraSignal} />
                <span className={`font-bold ${intraSignal === "CALL" ? "text-bullish" : intraSignal === "PUT" ? "text-bearish" : "text-muted-foreground"}`}>
                  {intraSignal}
                </span>
                <span className="text-muted-foreground/50">{intradaySignal?.confidence ?? 0}%</span>
                {/* RSI pill (NEW) */}
                {rsi != null && (
                  <span className={`text-[9px] px-1.5 py-0.5 rounded-full border font-bold ${
                    (rsiRegime === "deeply_oversold" || rsiRegime === "deeply_overbought")
                      ? "bg-red-500/15 border-red-500/30 text-red-400"
                      : (rsiRegime === "oversold" || rsiRegime === "overbought")
                      ? "bg-amber-500/15 border-amber-500/30 text-amber-400"
                      : "bg-white/5 border-white/10 text-muted-foreground"
                  }`}>RSI {rsi.toFixed(0)}</span>
                )}
              </div>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground/70">Swing (BTST)</span>
              <div className="flex items-center gap-1.5">
                <SignalIcon signal={swingDir} />
                <span className={`font-bold ${swingDir === "CALL" ? "text-bullish" : swingDir === "PUT" ? "text-bearish" : "text-muted-foreground"}`}>
                  {swingDir}
                </span>
                <span className="text-muted-foreground/50">{swingSignal?.confidence ?? 0}%</span>
              </div>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground/70">MTF Alignment</span>
              <span className={`font-bold text-[11px] ${overallBullish ? "text-bullish" : overallBearish ? "text-bearish" : "text-orange-400"}`}>
                {align?.confidence ?? 0}% confident
              </span>
            </div>
          </div>
        </div>

        {/* ── Col 2: Key Indicators ── */}
        <div className="space-y-3">
          <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/50 mb-1">Key Indicators</div>
          {tf5 && (
            <div className="rounded-xl p-3 border border-white/5 bg-white/[0.02] text-xs space-y-2">
              <div className="font-semibold text-foreground/70 flex items-center gap-1.5">
                <Activity className="w-3 h-3 text-primary/60" /> 5-min chart
              </div>
              <div className={rsiLabel(tf5.rsi).color}>{rsiLabel(tf5.rsi).text}</div>
              <div className={macdLabel(tf5.macdHistogram, tf5.macdSlope).color}>{macdLabel(tf5.macdHistogram, tf5.macdSlope).text}</div>
              <div className="text-muted-foreground/70">
                EMA8 ${tf5.ema8.toFixed(2)} {tf5.ema8 > tf5.ema21 ? "above" : "below"} EMA21 ${tf5.ema21.toFixed(2)} —{" "}
                <span className={tf5.ema8 > tf5.ema21 ? "text-bullish" : "text-bearish"}>
                  {tf5.ema8 > tf5.ema21 ? "bullish crossover" : "bearish crossover"}
                </span>
              </div>
            </div>
          )}
          {tf15 && (
            <div className="rounded-xl p-3 border border-white/5 bg-white/[0.02] text-xs space-y-2">
              <div className="font-semibold text-foreground/70 flex items-center gap-1.5">
                <Activity className="w-3 h-3 text-primary/60" /> 15-min chart
              </div>
              <div className={rsiLabel(tf15.rsi).color}>{rsiLabel(tf15.rsi).text}</div>
              <div className={macdLabel(tf15.macdHistogram, tf15.macdSlope).color}>{macdLabel(tf15.macdHistogram, tf15.macdSlope).text}</div>
              <div className="text-muted-foreground/70">
                Trend: <span className={tf15.trend === "bullish" ? "text-bullish" : tf15.trend === "bearish" ? "text-bearish" : "text-orange-400"}>{tf15.trend}</span>
              </div>
            </div>
          )}
          {tf1h && (
            <div className="rounded-xl p-3 border border-white/5 bg-white/[0.02] text-xs space-y-2">
              <div className="font-semibold text-foreground/70 flex items-center gap-1.5">
                <Activity className="w-3 h-3 text-primary/60" /> 1-hour chart
              </div>
              <div className={rsiLabel(tf1h.rsi).color}>{rsiLabel(tf1h.rsi).text}</div>
              <div className={macdLabel(tf1h.macdHistogram, tf1h.macdSlope).color}>{macdLabel(tf1h.macdHistogram, tf1h.macdSlope).text}</div>
              <div className="text-muted-foreground/70">
                Trend: <span className={tf1h.trend === "bullish" ? "text-bullish" : tf1h.trend === "bearish" ? "text-bearish" : "text-orange-400"}>{tf1h.trend}</span>
              </div>
            </div>
          )}
          {z?.volumeContext && (
            <div className="rounded-xl p-3 border border-white/5 bg-white/[0.02] text-xs">
              <div className={volLabel(z.volumeContext.relative, z.volumeContext.expanding).color}>
                {volLabel(z.volumeContext.relative, z.volumeContext.expanding).text}
              </div>
            </div>
          )}
        </div>

        {/* ── Col 3: Levels + Guidance ── */}
        <div className="space-y-3">
          <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/50 mb-1">Price Levels & Guidance</div>
          {z?.sessionLevels && (
            <div className="rounded-xl p-3 border border-white/5 bg-white/[0.02] text-xs space-y-1.5">
              <div className="font-semibold text-foreground/70 mb-1">Session Levels</div>
              <div className="flex justify-between"><span className="text-muted-foreground/70">Today Open</span><span className="font-mono font-bold text-foreground/80">${z.sessionLevels.todayOpen.toFixed(2)}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground/70">Session High</span><span className="font-mono font-bold text-bullish">${z.sessionLevels.sessionHigh.toFixed(2)}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground/70">Session Low</span><span className="font-mono font-bold text-bearish">${z.sessionLevels.sessionLow.toFixed(2)}</span></div>
              {nearestResist  > 0 && <div className="flex justify-between"><span className="text-muted-foreground/70">Nearest Resistance</span><span className="font-mono font-bold text-orange-400">${nearestResist.toFixed(2)}</span></div>}
              {nearestSupport > 0 && <div className="flex justify-between"><span className="text-muted-foreground/70">Nearest Support</span><span className="font-mono font-bold text-primary/80">${nearestSupport.toFixed(2)}</span></div>}
              {vix    != null && <div className="flex justify-between"><span className="text-muted-foreground/70">VIX Proxy</span><span className={`font-mono font-bold ${vix > 25 ? "text-bearish" : vix > 18 ? "text-orange-400" : "text-bullish"}`}>{vix.toFixed(1)}</span></div>}
              {expMove != null && <div className="flex justify-between"><span className="text-muted-foreground/70">Expected Move</span><span className="font-mono font-bold text-muted-foreground">±${expMove.toFixed(2)}</span></div>}
            </div>
          )}
          {z?.tradingAdvice && z.tradingAdvice.length > 0 && (
            <div className="rounded-xl p-3 border border-white/5 bg-white/[0.02] text-xs space-y-2">
              <div className="font-semibold text-foreground/70 mb-1">Action Guidance</div>
              {z.tradingAdvice.map((advice, i) => {
                const isWarning = /caution|wait|reduce|risky/i.test(advice);
                const isBullish = /call/i.test(advice) && !isWarning;
                return (
                  <div key={i} className="flex items-start gap-2">
                    {isWarning
                      ? <AlertTriangle className="w-3 h-3 text-orange-400 mt-0.5 shrink-0" />
                      : isBullish
                      ? <CheckCircle   className="w-3 h-3 text-bullish    mt-0.5 shrink-0" />
                      : <span className="w-3 h-3 rounded-full border border-muted-foreground/30 mt-0.5 shrink-0 inline-block" />
                    }
                    <span className={`leading-relaxed ${isWarning ? "text-orange-400/80" : "text-muted-foreground/80"}`}>{advice}</span>
                  </div>
                );
              })}
            </div>
          )}
          {swingSignal?.wyckoff?.phase && (
            <div className="rounded-xl p-3 border border-white/5 bg-white/[0.02] text-xs">
              <span className="text-muted-foreground/70">Wyckoff (daily): </span>
              <span className="font-semibold text-foreground/80">{swingSignal.wyckoff.phase}</span>
              {swingSignal.wyckoff.bias && (
                <span className={`ml-1 ${swingSignal.wyckoff.bias === "bullish" ? "text-bullish" : swingSignal.wyckoff.bias === "bearish" ? "text-bearish" : "text-muted-foreground"}`}>
                  · {swingSignal.wyckoff.bias} bias
                </span>
              )}
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
}
