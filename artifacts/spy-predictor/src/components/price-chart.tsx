import React from "react";
import { 
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer 
} from "recharts";
import { format, parseISO } from "date-fns";
import { Card } from "./ui-elements";
import { formatCurrency } from "@/lib/utils";
import type { TimePeriod } from "@/hooks/use-spy";
import { cn } from "@/lib/utils";

interface PriceChartProps {
  data: any[];
  period: TimePeriod;
  onPeriodChange: (period: TimePeriod) => void;
  isLoading?: boolean;
}

export function PriceChart({ data, period, onPeriodChange, isLoading }: PriceChartProps) {
  const periods: TimePeriod[] = ["1mo", "3mo", "6mo", "1y", "2y"];

  const formatXAxis = (tickItem: string) => {
    try {
      const date = parseISO(tickItem);
      if (period === "1mo" || period === "3mo") return format(date, "MMM d");
      return format(date, "MMM yy");
    } catch {
      return tickItem;
    }
  };

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      const value = payload[0].value;
      const date = parseISO(label);
      return (
        <div className="bg-card/90 backdrop-blur-md border border-border p-3 rounded-lg shadow-xl shadow-black/50">
          <p className="text-muted-foreground text-xs mb-1 font-medium">{format(date, "MMM d, yyyy")}</p>
          <p className="text-foreground font-mono font-bold text-lg">{formatCurrency(value)}</p>
        </div>
      );
    }
    return null;
  };

  const min = data ? Math.min(...data.map(d => d.close)) : 0;
  const max = data ? Math.max(...data.map(d => d.close)) : 100;
  const domainPadding = (max - min) * 0.1;

  return (
    <Card className="p-1 flex flex-col h-full col-span-1 lg:col-span-8">
      <div className="p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-foreground">Price Action</h2>
          <p className="text-sm text-muted-foreground">Historical close prices (SPY)</p>
        </div>
        <div className="flex bg-muted/50 p-1 rounded-lg border border-white/5">
          {periods.map((p) => (
            <button
              key={p}
              onClick={() => onPeriodChange(p)}
              disabled={isLoading}
              className={cn(
                "px-4 py-1.5 rounded-md text-xs font-semibold uppercase tracking-wider transition-all duration-200",
                period === p 
                  ? "bg-card text-foreground shadow-sm border border-white/10" 
                  : "text-muted-foreground hover:text-foreground hover:bg-white/5",
                isLoading && "opacity-50 cursor-not-allowed"
              )}
            >
              {p}
            </button>
          ))}
        </div>
      </div>
      
      <div className="flex-1 w-full min-h-[300px] pb-4 px-2">
        {isLoading ? (
          <div className="w-full h-full flex items-center justify-center">
            <div className="w-full h-full bg-muted/20 animate-pulse rounded-xl mx-4" />
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="colorPrice" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3}/>
                  <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" strokeOpacity={0.4} />
              <XAxis 
                dataKey="date" 
                axisLine={false} 
                tickLine={false} 
                tickFormatter={formatXAxis}
                tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }}
                dy={10}
                minTickGap={30}
              />
              <YAxis 
                domain={[min - domainPadding, max + domainPadding]} 
                axisLine={false} 
                tickLine={false} 
                tickFormatter={(val) => `$${val.toFixed(0)}`}
                tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12, fontFamily: 'monospace' }}
                dx={-10}
                orientation="right"
              />
              <Tooltip content={<CustomTooltip />} />
              <Area 
                type="monotone" 
                dataKey="close" 
                stroke="hsl(var(--primary))" 
                strokeWidth={2}
                fillOpacity={1} 
                fill="url(#colorPrice)" 
                animationDuration={1500}
                animationEasing="ease-out"
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>
    </Card>
  );
}
