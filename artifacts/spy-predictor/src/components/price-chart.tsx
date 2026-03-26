import React from "react";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";
import { format, parseISO } from "date-fns";
import { Card } from "./ui-elements";
import { formatCurrency } from "@/lib/utils";
import type { TimePeriod } from "@/hooks/use-spy";
import { INTRADAY_PERIODS, HISTORICAL_PERIODS } from "@/hooks/use-spy";
import { cn } from "@/lib/utils";

interface PriceChartProps {
  data: any[];
  period: TimePeriod;
  onPeriodChange: (period: TimePeriod) => void;
  isLoading?: boolean;
  priceChange?: number;
  priceChangePct?: number;
}

function parseBarDate(dateStr: string): Date {
  if (!dateStr) return new Date();
  if (dateStr.includes("T")) return parseISO(dateStr);
  return new Date(dateStr);
}

function formatXAxis(period: TimePeriod) {
  return (tickItem: string) => {
    try {
      const d = parseBarDate(tickItem);
      if (period === "1h") return format(d, "h:mm a");
      if (period === "1d") return format(d, "h:mm a");
      if (period === "1w") return format(d, "EEE h a");
      if (period === "1mo" || period === "3mo") return format(d, "MMM d");
      return format(d, "MMM yy");
    } catch {
      return tickItem;
    }
  };
}

function formatTooltipDate(period: TimePeriod, d: Date): string {
  if (period === "1h" || period === "1d") return format(d, "h:mm a, MMM d");
  if (period === "1w") return format(d, "EEE MMM d, h a");
  return format(d, "MMM d, yyyy");
}

function getSubtitle(period: TimePeriod): string {
  if (period === "1h") return "1-min bars · Last 90 minutes (SPY)";
  if (period === "1d") return "5-min bars · Today's session (SPY)";
  if (period === "1w") return "1-hour bars · This week (SPY)";
  return "Historical close prices (SPY)";
}

function getRefetchMs(period: TimePeriod): number {
  if (period === "1h") return 60 * 1000;
  if (period === "1d") return 5 * 60 * 1000;
  if (period === "1w") return 15 * 60 * 1000;
  return 5 * 60 * 1000;
}

export { getRefetchMs };

export function PriceChart({ data, period, onPeriodChange, isLoading, priceChange, priceChangePct }: PriceChartProps) {
  const isIntraday = (INTRADAY_PERIODS as TimePeriod[]).includes(period);
  const isUp = (priceChange ?? 0) >= 0;

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      const value = payload[0].value;
      const d = parseBarDate(label);
      return (
        <div className="bg-card/95 backdrop-blur-md border border-border p-3 rounded-lg shadow-xl shadow-black/50">
          <p className="text-muted-foreground text-xs mb-1 font-medium">{formatTooltipDate(period, d)}</p>
          <p className="text-foreground font-mono font-bold text-lg">{formatCurrency(value)}</p>
        </div>
      );
    }
    return null;
  };

  const closes = data?.map((d: any) => d.close).filter(Boolean) ?? [];
  const min = closes.length ? Math.min(...closes) : 0;
  const max = closes.length ? Math.max(...closes) : 100;
  const domainPadding = (max - min) * 0.08;

  const areaColor = isIntraday
    ? isUp ? "#22c55e" : "#ef4444"
    : "hsl(var(--primary))";

  return (
    <Card className="p-1 flex flex-col h-full col-span-1 lg:col-span-8">
      <div className="p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-foreground">Price Action</h2>
          <p className="text-sm text-muted-foreground">{getSubtitle(period)}</p>
          {isIntraday && priceChangePct !== undefined && (
            <span className={cn(
              "text-xs font-semibold font-mono mt-0.5 inline-block",
              isUp ? "text-green-400" : "text-red-400"
            )}>
              {isUp ? "+" : ""}{priceChangePct.toFixed(2)}% {period === "1h" ? "this hour" : period === "1d" ? "today" : "this week"}
            </span>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-1">
          {/* Short-term group */}
          <div className="flex bg-muted/50 p-1 rounded-lg border border-white/5">
            {INTRADAY_PERIODS.map((p) => (
              <button
                key={p}
                onClick={() => onPeriodChange(p)}
                disabled={isLoading}
                className={cn(
                  "px-3 py-1.5 rounded-md text-xs font-semibold uppercase tracking-wider transition-all duration-200",
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

          {/* Divider */}
          <div className="w-px h-5 bg-white/10 mx-0.5" />

          {/* Long-term group */}
          <div className="flex bg-muted/50 p-1 rounded-lg border border-white/5">
            {HISTORICAL_PERIODS.map((p) => (
              <button
                key={p}
                onClick={() => onPeriodChange(p)}
                disabled={isLoading}
                className={cn(
                  "px-3 py-1.5 rounded-md text-xs font-semibold uppercase tracking-wider transition-all duration-200",
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
                  <stop offset="5%" stopColor={areaColor} stopOpacity={0.25} />
                  <stop offset="95%" stopColor={areaColor} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" strokeOpacity={0.4} />
              <XAxis
                dataKey="date"
                axisLine={false}
                tickLine={false}
                tickFormatter={formatXAxis(period)}
                tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }}
                dy={10}
                minTickGap={isIntraday ? 40 : 30}
              />
              <YAxis
                domain={[min - domainPadding, max + domainPadding]}
                axisLine={false}
                tickLine={false}
                tickFormatter={(val) => `$${val.toFixed(0)}`}
                tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11, fontFamily: "monospace" }}
                dx={-10}
                orientation="right"
              />
              <Tooltip content={<CustomTooltip />} />
              <Area
                type="monotone"
                dataKey="close"
                stroke={areaColor}
                strokeWidth={isIntraday ? 1.5 : 2}
                fillOpacity={1}
                fill="url(#colorPrice)"
                dot={false}
                animationDuration={600}
                animationEasing="ease-out"
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>
    </Card>
  );
}
