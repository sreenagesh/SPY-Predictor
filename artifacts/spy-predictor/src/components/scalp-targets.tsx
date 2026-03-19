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
  const { bias, atr, estimatedDayRange, longSetup, shortSetup, notes } = scalpTargets;

  const biasConfig = {
    long: { label: "Long Bias", variant: "bullish" as const },
    short: { label: "Short Bias", variant: "bearish" as const },
    neutral: { label: "Range Bound", variant: "neutral" as const },
  };

  const currentBias = biasConfig[bias] || biasConfig.neutral;

  const SetupPanel = ({ 
    title, 
    setup, 
    type, 
    isFavored 
  }: { 
    title: string; 
    setup: ScalpSetup; 
    type: "long" | "short";
    isFavored: boolean;
  }) => {
    const isLong = type === "long";
    const headerColor = isLong ? "text-bullish" : "text-bearish";
    const bgHeaderColor = isLong ? "bg-bullish/10" : "bg-bearish/10";
    const Icon = isLong ? TrendingUp : TrendingDown;

    return (
      <div className={`flex flex-col rounded-xl overflow-hidden border border-white/5 bg-background/40 transition-opacity duration-300 ${!isFavored ? "opacity-50 hover:opacity-100" : ""}`}>
        <div className={`px-4 py-3 flex items-center justify-between ${bgHeaderColor}`}>
          <div className="flex items-center gap-2">
            <Icon className={`w-4 h-4 ${headerColor}`} />
            <span className={`font-semibold text-sm ${headerColor}`}>{title}</span>
          </div>
          <Badge variant="outline" className="text-[10px] py-0 h-5">
            R/R {setup.riskReward.toFixed(2)}
          </Badge>
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
      <div className="flex items-start justify-between mb-6">
        <div>
          <h2 className="text-lg font-bold text-foreground mb-1">Intraday Scalp Targets</h2>
          <p className="text-sm text-muted-foreground">Actionable short-term setups</p>
        </div>
        <Badge variant={currentBias.variant}>
          {currentBias.label}
        </Badge>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
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

      <div className="grid grid-cols-2 gap-4 mb-6">
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
