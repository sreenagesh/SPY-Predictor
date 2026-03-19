import React from "react";
import { Card } from "./ui-elements";
import { formatCurrency } from "@/lib/utils";
import { ArrowDown, ArrowUp, Target, ShieldAlert } from "lucide-react";

interface PriceTargetsProps {
  targets: {
    support: number;
    resistance: number;
    upside: number;
    downside: number;
  };
  currentPrice: number;
}

export function PriceTargetsCard({ targets, currentPrice }: PriceTargetsProps) {
  const items = [
    { label: "Upside Target", value: targets.upside, icon: ArrowUp, color: "text-bullish", bg: "bg-bullish/10" },
    { label: "Resistance", value: targets.resistance, icon: Target, color: "text-rose-300", bg: "bg-rose-500/10" },
    { label: "Current Price", value: currentPrice, icon: null, color: "text-foreground", bg: "bg-primary/20 ring-1 ring-primary/50" },
    { label: "Support", value: targets.support, icon: ShieldAlert, color: "text-emerald-300", bg: "bg-emerald-500/10" },
    { label: "Downside Target", value: targets.downside, icon: ArrowDown, color: "text-bearish", bg: "bg-bearish/10" },
  ];

  return (
    <Card className="col-span-1 lg:col-span-4 p-6 flex flex-col">
      <div className="mb-6">
        <h2 className="text-lg font-bold text-foreground">Key Levels</h2>
        <p className="text-sm text-muted-foreground">Estimated support & resistance targets</p>
      </div>

      <div className="flex-1 flex flex-col justify-center space-y-3 relative">
        {/* Connecting line */}
        <div className="absolute left-[2.25rem] top-4 bottom-4 w-px bg-gradient-to-b from-bullish via-primary/20 to-bearish opacity-30" />
        
        {items.map((item, i) => (
          <div key={i} className="flex items-center gap-4 relative z-10">
            <div className={`w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 backdrop-blur-md ${item.bg}`}>
              {item.icon ? (
                <item.icon className={`w-5 h-5 ${item.color}`} />
              ) : (
                <div className="w-2.5 h-2.5 rounded-full bg-primary animate-pulse" />
              )}
            </div>
            <div className="flex-1 bg-background/40 px-4 py-2.5 rounded-lg border border-white/5 flex justify-between items-center">
              <span className={`text-sm font-medium ${item.color === 'text-foreground' ? 'text-primary' : 'text-muted-foreground'}`}>
                {item.label}
              </span>
              <span className={`font-mono font-bold ${item.color}`}>
                {formatCurrency(item.value)}
              </span>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}
