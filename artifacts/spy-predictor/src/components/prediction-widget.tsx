import React from "react";
import { Card, Badge } from "./ui-elements";
import { motion } from "framer-motion";
import { TrendingUp, TrendingDown, Minus, Info } from "lucide-react";
import { cn } from "@/lib/utils";

interface PredictionWidgetProps {
  prediction: "bullish" | "bearish" | "neutral";
  confidence: number;
  summary: string;
}

export function PredictionWidget({ prediction, confidence, summary }: PredictionWidgetProps) {
  const isBullish = prediction === "bullish";
  const isBearish = prediction === "bearish";
  
  const Icon = isBullish ? TrendingUp : isBearish ? TrendingDown : Minus;
  
  const colorClass = isBullish 
    ? "text-bullish" 
    : isBearish 
      ? "text-bearish" 
      : "text-neutral";
      
  const bgGlowClass = isBullish 
    ? "bg-bullish/10 shadow-[0_0_40px_rgba(22,163,74,0.15)] border-bullish/20" 
    : isBearish 
      ? "bg-bearish/10 shadow-[0_0_40px_rgba(225,29,72,0.15)] border-bearish/20" 
      : "bg-neutral/10 shadow-[0_0_40px_rgba(245,158,11,0.15)] border-neutral/20";

  return (
    <Card className={cn("col-span-1 lg:col-span-4 p-6 flex flex-col border", bgGlowClass)}>
      <div className="flex justify-between items-start mb-6">
        <div>
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-widest mb-1">AI Prediction</h2>
          <div className="flex items-center gap-3 mt-2">
            <Icon className={cn("w-8 h-8", colorClass)} strokeWidth={2.5} />
            <span className={cn("text-4xl font-display font-bold capitalize tracking-tight", colorClass)}>
              {prediction}
            </span>
          </div>
        </div>
        <Badge variant={prediction}>Live</Badge>
      </div>

      <div className="flex-1 flex flex-col justify-center py-4">
        <div className="mb-2 flex justify-between items-end">
          <span className="text-sm font-medium text-muted-foreground">Confidence Score</span>
          <span className="text-2xl font-mono font-bold text-foreground">{confidence}%</span>
        </div>
        <div className="h-3 w-full bg-background rounded-full overflow-hidden border border-white/5">
          <motion.div 
            initial={{ width: 0 }}
            animate={{ width: `${confidence}%` }}
            transition={{ duration: 1.5, ease: "easeOut" }}
            className={cn(
              "h-full rounded-full",
              isBullish ? "bg-bullish" : isBearish ? "bg-bearish" : "bg-neutral"
            )}
          />
        </div>
      </div>

      <div className="mt-4 pt-4 border-t border-border/50">
        <div className="flex gap-2 items-start text-sm text-muted-foreground leading-relaxed">
          <Info className="w-5 h-5 flex-shrink-0 text-primary/70 mt-0.5" />
          <p>{summary}</p>
        </div>
      </div>
    </Card>
  );
}
