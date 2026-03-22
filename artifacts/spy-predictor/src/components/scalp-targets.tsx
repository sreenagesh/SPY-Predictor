import React from "react";
import { Card, Badge } from "./ui-elements";
import { formatCurrency } from "@/lib/utils";
import { Info, TrendingUp, TrendingDown, Crosshair, Target, ShieldAlert } from "lucide-react";

interface ScalpSetup {
  entry: number;
  t1: number;
  t2: number;
  stopLoss: number;
  riskReward: number;
}

interface IntradayScalpTargets {
  bias: "long" | "short" | "neutral";
  score: number;
  atr: number;
  estimatedDayRange: number;
  longSetup: ScalpSetup;
  shortSetup: ScalpSetup;
  notes: string;
}

interface ScalpTargetsProps {
  scalpTargets: IntradayScalpTargets;
  currentPrice: number;
}

export function ScalpTargetsCard({ scalpTargets, currentPrice }: ScalpTargetsProps) {
  const { bias, score, atr, estimatedDayRange, longSetup, shortSetup, notes } = scalpTargets;

  const biasConfig = {
    long: { label: "Long Bias", variant: "bullish" as const, color: "text-bullish" },
    short: { label: "Short Bias", variant: "bearish" as const, color: "text-bearish" },
    neutral: { label: "Range Bound", variant: "neutral" as const, color: "text-neutral" },
  };

  const currentBias = biasConfig[bias] || biasConfig.neutral;

  // Momentum score meter: clamp to -100/+100
  const clampedScore = Math.max(-100, Math.min(100, score));
  const scorePct = Math.abs(clampedScore) / 100;
  const scoreColor = clampedScore > 0 ? "#22c55e" : clampedScore < 0 ? "#ef4444" : "#f59e0b";
  const scoreBarLeft = clampedScore >= 0 ? "50%" : `${50 - scorePct * 50}%`;
  const scoreBarWidth = `${scorePct * 50}%`;

  const SetupPanel = ({
    title,
    setup,
    type,
    isFavored,
  }: {
    title: string;
    setup: ScalpSetup;
    type: "long" | "short";
    isFavored: boolean;
  }) => {
    const isLong = type === "long";
    const headerColor = isLong ? "text-bullish" : "text-bearish";
    const bgHeaderColor = isLong ? "bg-bullish/10" : "bg-bearish/10";
    const borderColor = isFavored ? (isLong ? "border-bullish/30" : "border-bearish/30") : "border-white/5";
    const Icon = isLong ? TrendingUp : TrendingDown;

    return (
      <div
        className={`flex flex-col rounded-xl overflow-hidden border transition-all duration-300 ${borderColor} bg-background/40 ${!isFavored ? "opacity-35 grayscale hover:opacity-70 hover:grayscale-0" : ""}`}
      >
        <div className={`px-4 py-3 flex items-center justify-between ${bgHeaderColor}`}>
          <div className="flex items-center gap-2">
            <Icon className={`w-4 h-4 ${headerColor}`} />
            <span className={`font-semibold text-sm ${headerColor}`}>{title}</span>
          </div>
          <div className="flex items-center gap-2">
            {isFavored && bias !== "neutral" && (
              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${isLong ? "bg-bullish/20 text-bullish" : "bg-bearish/20 text-bearish"}`}>
                FAVORED
              </span>
            )}
            <Badge variant="outline" className="text-[10px] py-0 h-5">
              R/R {setup.riskReward.toFixed(2)}
            </Badge>
          </div>
        </div>
        <div className="p-4 flex flex-col gap-3">
          <div className="flex justify-between items-center">
            <span className="text-sm text-muted-foreground flex items-center gap-1.5">
              <Crosshair className="w-3.5 h-3.5" /> Entry
            </span>
            <span className="font-mono font-medium">{formatCurrency(setup.entry)}</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-sm text-muted-foreground flex items-center gap-1.5">
              <Target className="w-3.5 h-3.5 text-primary/70" /> T1
            </span>
            <span className="font-mono font-medium">{formatCurrency(setup.t1)}</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-sm text-muted-foreground flex items-center gap-1.5">
              <Target className="w-3.5 h-3.5 text-primary" /> T2
            </span>
            <span className="font-mono font-medium">{formatCurrency(setup.t2)}</span>
          </div>
          <div className="h-px w-full bg-white/5 my-1" />
          <div className="flex justify-between items-center">
            <span className="text-sm text-muted-foreground flex items-center gap-1.5">
              <ShieldAlert className="w-3.5 h-3.5 text-destructive/70" /> Stop Loss
            </span>
            <span className="font-mono font-medium text-destructive">{formatCurrency(setup.stopLoss)}</span>
          </div>
        </div>
      </div>
    );
  };

  return (
    <Card className="p-6 flex flex-col h-full w-full">
      <div className="flex items-start justify-between mb-4">
        <div>
          <h2 className="text-lg font-bold text-foreground mb-1">Intraday Scalp Targets</h2>
          <p className="text-sm text-muted-foreground">Short-term momentum driven setups</p>
        </div>
        <Badge variant={currentBias.variant}>
          {currentBias.label}
        </Badge>
      </div>

      {/* Momentum score meter */}
      <div className="mb-5 px-1">
        <div className="flex justify-between items-center mb-1.5">
          <span className="text-xs text-muted-foreground">Momentum Score</span>
          <span className={`text-sm font-bold font-mono ${currentBias.color}`}>
            {clampedScore > 0 ? "+" : ""}{clampedScore}
          </span>
        </div>
        <div className="relative h-2 rounded-full bg-secondary/50 overflow-hidden">
          {/* Center axis */}
          <div className="absolute left-1/2 top-0 w-px h-full bg-white/20" />
          {/* Score bar */}
          <div
            className="absolute top-0 h-full rounded-full transition-all duration-700"
            style={{
              left: scoreBarLeft,
              width: scoreBarWidth,
              backgroundColor: scoreColor,
            }}
          />
        </div>
        <div className="flex justify-between mt-1">
          <span className="text-[10px] text-muted-foreground/50">Bearish −100</span>
          <span className="text-[10px] text-muted-foreground/50">Bullish +100</span>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-5">
        <SetupPanel
          title="Long Setup"
          setup={longSetup}
          type="long"
          isFavored={bias === "long" || bias === "neutral"}
        />
        <SetupPanel
          title="Short Setup"
          setup={shortSetup}
          type="short"
          isFavored={bias === "short" || bias === "neutral"}
        />
      </div>

      <div className="grid grid-cols-2 gap-4 mb-5">
        <div className="bg-secondary/30 rounded-lg p-3 flex flex-col">
          <span className="text-xs text-muted-foreground mb-1">Daily ATR</span>
          <span className="font-mono text-sm font-medium">{formatCurrency(atr)}</span>
        </div>
        <div className="bg-secondary/30 rounded-lg p-3 flex flex-col">
          <span className="text-xs text-muted-foreground mb-1">Est. Day Range</span>
          <span className="font-mono text-sm font-medium">{formatCurrency(estimatedDayRange)}</span>
        </div>
      </div>

      <div className="mt-auto pt-4 border-t border-white/5 flex items-start gap-2 text-muted-foreground">
        <Info className="w-4 h-4 mt-0.5 flex-shrink-0 opacity-70" />
        <p className="text-sm italic opacity-80 leading-relaxed">{notes}</p>
      </div>
    </Card>
  );
}
