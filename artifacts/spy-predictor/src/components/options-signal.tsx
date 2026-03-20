import React from "react";
import { motion } from "framer-motion";
import { Card, Badge } from "./ui-elements";
import { cn, formatCurrency } from "@/lib/utils";
import type { OptionsSignalResponse } from "@workspace/api-client-react";
import { Crosshair, Target, ShieldAlert, Zap, BarChart2, Activity, Calendar, Info } from "lucide-react";

interface OptionsSignalCardProps {
  optionsSignal: OptionsSignalResponse;
}

export function OptionsSignalCard({ optionsSignal }: OptionsSignalCardProps) {
  const { signal, confidence, reasoning, keyFactors, technicalScore, trade } = optionsSignal;

  const isCall = signal === "CALL";
  const isPut = signal === "PUT";
  const isWait = signal === "WAIT";

  const colorClass = isCall 
    ? "text-bullish" 
    : isPut 
      ? "text-bearish" 
      : "text-neutral";
      
  const bgGlowClass = isCall 
    ? "bg-bullish/5 shadow-[0_0_50px_rgba(22,163,74,0.15)] border-bullish/30" 
    : isPut 
      ? "bg-bearish/5 shadow-[0_0_50px_rgba(225,29,72,0.15)] border-bearish/30" 
      : "bg-neutral/5 shadow-[0_0_50px_rgba(245,158,11,0.15)] border-neutral/30";

  const headerColor = isCall ? "bg-bullish text-black" : isPut ? "bg-bearish text-white" : "bg-neutral text-black";

  // Score meter
  const scoreColor = technicalScore > 0 ? "bg-bullish" : technicalScore < 0 ? "bg-bearish" : "bg-neutral";

  return (
    <Card className={cn("col-span-1 lg:col-span-12 flex flex-col border-2 overflow-hidden relative", bgGlowClass)}>
      {/* Thick colored header bar */}
      <div className={cn("h-4 w-full", headerColor)} />

      <div className="p-6 md:p-8">
        <div className="flex flex-col md:flex-row gap-8 items-stretch">
          
          {/* Signal & Strength - Left Column */}
          <div className="flex-1 min-w-[280px] flex flex-col justify-center h-full gap-8">
            <div>
              <h2 className="text-sm font-bold text-muted-foreground uppercase tracking-widest mb-4 flex items-center gap-2">
                <Zap className="w-5 h-5 text-primary" /> Options Trade Signal
              </h2>
              
              <div className="flex items-center gap-5 mt-2">
                <motion.div
                  animate={{ scale: [1, 1.15, 1], opacity: [0.7, 1, 0.7] }}
                  transition={{ repeat: Infinity, duration: 2 }}
                  className={cn("w-5 h-5 rounded-full shadow-[0_0_20px_rgba(currentColor)]", 
                    isCall ? "bg-bullish" : isPut ? "bg-bearish" : "bg-neutral"
                  )}
                />
                <span className={cn("text-7xl md:text-8xl font-display font-black tracking-tighter", colorClass)}>
                  {signal}
                </span>
              </div>
            </div>

            <div className="space-y-6">
              {/* Confidence */}
              <div>
                <div className="mb-2 flex justify-between items-end">
                  <span className="text-sm font-semibold text-muted-foreground">Signal Strength</span>
                  <span className="text-2xl font-mono font-bold text-foreground">{confidence}%</span>
                </div>
                <div className="h-4 w-full bg-background rounded-full overflow-hidden border border-white/5">
                  <motion.div 
                    initial={{ width: 0 }}
                    animate={{ width: `${confidence}%` }}
                    transition={{ duration: 1.5, ease: "easeOut" }}
                    className={cn(
                      "h-full rounded-full",
                      isCall ? "bg-bullish" : isPut ? "bg-bearish" : "bg-neutral"
                    )}
                  />
                </div>
              </div>

              {/* Technical Score */}
              <div>
                <div className="mb-2 flex justify-between items-end">
                  <span className="text-sm font-semibold text-muted-foreground">Technical Score (-100 to +100)</span>
                  <span className={cn("text-2xl font-mono font-bold", technicalScore > 0 ? "text-bullish" : technicalScore < 0 ? "text-bearish" : "text-neutral")}>
                    {technicalScore > 0 ? "+" : ""}{technicalScore}
                  </span>
                </div>
                <div className="relative h-4 w-full bg-background rounded-full overflow-hidden border border-white/5 flex items-center">
                  <div className="absolute left-1/2 top-0 bottom-0 w-0.5 bg-muted-foreground/50 z-10" />
                  <div className="w-full h-full relative">
                    <motion.div 
                      initial={{ width: 0 }}
                      animate={{ 
                        width: `${Math.abs(technicalScore) / 2}%`,
                      }}
                      style={
                        technicalScore < 0 
                        ? { right: "50%", transformOrigin: "right", position: "absolute" }
                        : { left: "50%", transformOrigin: "left", position: "absolute" }
                      }
                      transition={{ duration: 1.5, ease: "easeOut" }}
                      className={cn(
                        "top-0 bottom-0 h-full",
                        technicalScore < 0 ? "rounded-l-full" : "rounded-r-full",
                        scoreColor
                      )}
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Vertical Divider */}
          <div className="hidden md:block w-px bg-white/10" />

          {/* Right Column - Trade Levels & Factors */}
          <div className="flex-[2] w-full flex flex-col gap-6 justify-center">
            {!isWait && trade && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Premium Levels */}
                <div className="rounded-xl overflow-hidden border border-white/10 bg-black/30 backdrop-blur-sm">
                  <div className="px-5 py-3 bg-secondary/80 border-b border-white/5 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Zap className="w-4 h-4 text-primary" />
                      <span className="font-semibold text-sm text-foreground uppercase tracking-wider">Premium Target</span>
                    </div>
                  </div>
                  <div className="p-5 flex flex-col gap-4">
                    <div className="flex justify-between items-center">
                      <span className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                        <Crosshair className="w-4 h-4" /> Entry Price
                      </span>
                      <span className="font-mono font-bold text-xl text-foreground">${trade.premiumEntry.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                        <Target className="w-4 h-4 text-primary/70" /> T1 (2x)
                      </span>
                      <span className="font-mono font-semibold text-lg text-primary/90">${trade.premiumT1.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                        <Target className="w-4 h-4 text-primary" /> T2 (3.5x)
                      </span>
                      <span className="font-mono font-semibold text-lg text-primary">${trade.premiumT2.toFixed(2)}</span>
                    </div>
                    <div className="h-px w-full bg-white/5 my-1" />
                    <div className="flex justify-between items-center">
                      <span className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                        <ShieldAlert className="w-4 h-4 text-destructive/70" /> Stop Loss
                      </span>
                      <span className="font-mono font-bold text-lg text-destructive">${trade.premiumStop.toFixed(2)}</span>
                    </div>
                  </div>
                </div>

                {/* Underlying Levels */}
                <div className="rounded-xl overflow-hidden border border-white/10 bg-black/30 backdrop-blur-sm">
                  <div className="px-5 py-3 bg-secondary/80 border-b border-white/5 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Activity className="w-4 h-4 text-primary" />
                      <span className="font-semibold text-sm text-foreground uppercase tracking-wider">Underlying (SPY)</span>
                    </div>
                  </div>
                  <div className="p-5 flex flex-col gap-4">
                    <div className="flex justify-between items-center">
                      <span className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                        <Crosshair className="w-4 h-4" /> Spot Entry
                      </span>
                      <span className="font-mono font-bold text-xl text-foreground">{formatCurrency(trade.underlyingEntry)}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                        <Target className="w-4 h-4 text-primary/70" /> T1 Level
                      </span>
                      <span className="font-mono font-semibold text-lg text-primary/90">{formatCurrency(trade.underlyingT1)}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                        <Target className="w-4 h-4 text-primary" /> T2 Level
                      </span>
                      <span className="font-mono font-semibold text-lg text-primary">{formatCurrency(trade.underlyingT2)}</span>
                    </div>
                    <div className="h-px w-full bg-white/5 my-1" />
                    <div className="flex justify-between items-center">
                      <span className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                        <ShieldAlert className="w-4 h-4 text-destructive/70" /> Invalidation
                      </span>
                      <span className="font-mono font-bold text-lg text-destructive">{formatCurrency(trade.underlyingStop)}</span>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Info Row (Strike, Expiry, DTE, etc) */}
            {!isWait && trade && (
              <div className="flex flex-wrap items-center gap-4 p-4 bg-black/40 rounded-xl border border-white/10 text-sm">
                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground font-medium">Strike:</span>
                  <span className="font-mono font-bold text-foreground text-base">{trade.strike}</span>
                </div>
                <div className="w-px h-5 bg-white/20" />
                <div className="flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-muted-foreground" />
                  <span className="font-mono font-bold text-foreground text-base">
                    {new Date(trade.expiration).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                  </span>
                </div>
                <div className="w-px h-5 bg-white/20" />
                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground font-medium">DTE:</span>
                  <span className="font-mono font-bold text-foreground text-base">{trade.daysToExpiry}</span>
                </div>
                
                {trade.impliedVolatility !== null && (
                  <>
                    <div className="w-px h-5 bg-white/20" />
                    <div className="flex items-center gap-2">
                      <span className="text-muted-foreground font-medium">IV:</span>
                      <span className="font-mono font-bold text-foreground text-base">{(trade.impliedVolatility * 100).toFixed(1)}%</span>
                    </div>
                  </>
                )}
                
                {trade.delta !== null && (
                  <>
                    <div className="w-px h-5 bg-white/20" />
                    <div className="flex items-center gap-2">
                      <span className="text-muted-foreground font-medium">Δ:</span>
                      <span className="font-mono font-bold text-foreground text-base">{trade.delta.toFixed(2)}</span>
                    </div>
                  </>
                )}
              </div>
            )}

            {/* Key Factors */}
            <div className="bg-black/30 p-5 rounded-xl border border-white/10 backdrop-blur-sm mt-auto">
              <h3 className="text-sm font-bold text-foreground mb-4 flex items-center gap-2 uppercase tracking-wider">
                <BarChart2 className="w-4 h-4 text-muted-foreground" /> Key Factors
              </h3>
              <ul className="space-y-3">
                {keyFactors.map((factor, i) => {
                  const factorLower = factor.toLowerCase();
                  const isBullish = factorLower.includes("bullish") || factorLower.includes("above") || factorLower.includes("positive");
                  const isBearish = factorLower.includes("bearish") || factorLower.includes("below") || factorLower.includes("negative");
                  const icon = isBullish ? "▲" : isBearish ? "▼" : "•";
                  const factorColor = isBullish ? "text-bullish" : isBearish ? "text-bearish" : "text-muted-foreground";
                  
                  return (
                    <li key={i} className="flex items-start gap-3 text-sm">
                      <span className={cn("mt-0.5 text-[12px]", factorColor)}>{icon}</span>
                      <span className="text-foreground/90 font-medium">{factor}</span>
                    </li>
                  );
                })}
              </ul>
            </div>
          </div>
        </div>

        {/* Reasoning at Bottom */}
        <div className="mt-8 pt-6 border-t border-white/10">
          <div className="flex gap-3 items-start text-muted-foreground leading-relaxed">
            <Info className="w-6 h-6 flex-shrink-0 text-primary/70" />
            <p className="italic font-medium text-base text-foreground/80">{reasoning}</p>
          </div>
        </div>

      </div>
    </Card>
  );
}
