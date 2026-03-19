import React from "react";
import { Card, Badge } from "./ui-elements";
import { motion } from "framer-motion";

interface Indicator {
  name: string;
  value: number;
  signal: "bullish" | "bearish" | "neutral";
  description: string;
}

interface IndicatorsGridProps {
  indicators: Indicator[];
}

export function IndicatorsGrid({ indicators }: IndicatorsGridProps) {
  const container = {
    hidden: { opacity: 0 },
    show: {
      opacity: 1,
      transition: { staggerChildren: 0.1 }
    }
  };

  const item = {
    hidden: { opacity: 0, y: 20 },
    show: { opacity: 1, y: 0, transition: { type: "spring", stiffness: 300, damping: 24 } }
  };

  return (
    <Card className="col-span-1 lg:col-span-8 p-6">
      <div className="mb-6">
        <h2 className="text-lg font-bold text-foreground">Technical Indicators</h2>
        <p className="text-sm text-muted-foreground">Current readings driving the prediction model.</p>
      </div>

      <motion.div 
        variants={container}
        initial="hidden"
        animate="show"
        className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4"
      >
        {indicators.map((ind, i) => (
          <motion.div 
            key={i} 
            variants={item}
            className="bg-background/50 border border-white/5 p-4 rounded-xl hover:bg-muted/50 transition-colors duration-200"
          >
            <div className="flex justify-between items-start mb-3">
              <h3 className="font-semibold text-sm text-foreground">{ind.name}</h3>
              <Badge variant={ind.signal as any}>{ind.signal}</Badge>
            </div>
            <div className="mb-2">
              <span className="text-2xl font-mono font-bold text-foreground">
                {ind.value.toLocaleString('en-US', { maximumFractionDigits: 2 })}
              </span>
            </div>
            <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed">
              {ind.description}
            </p>
          </motion.div>
        ))}
      </motion.div>
    </Card>
  );
}
