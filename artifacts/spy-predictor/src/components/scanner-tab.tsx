import React, { useState } from "react";
import { motion } from "framer-motion";
import { TrendingUp, TrendingDown, RefreshCw, Clock } from "lucide-react";
import { useScanner, type ScannerInterval } from "@/hooks/use-spy";
import type { ScannerStock } from "@workspace/api-client-react";

const INTERVALS: { label: string; value: ScannerInterval }[] = [
  { label: "5 min",  value: 5  },
  { label: "15 min", value: 15 },
  { label: "30 min", value: 30 },
  { label: "45 min", value: 45 },
  { label: "1 hr",   value: 60 },
];

function SignalBadge({ strength }: { strength: number }) {
  const labels = ["", "Weak", "Moderate", "Strong", "Very Strong"];
  const colors = [
    "",
    "bg-yellow-500/20 text-yellow-400",
    "bg-orange-500/20 text-orange-400",
    "bg-green-500/20 text-green-400",
    "bg-emerald-500/20 text-emerald-400 font-bold",
  ];
  return (
    <span className={`text-[10px] px-2 py-0.5 rounded-full ${colors[strength] ?? colors[3]}`}>
      {labels[strength] ?? "Strong"}
    </span>
  );
}

function StockRow({ stock, type }: { stock: ScannerStock; type: "breakout" | "breakdown" }) {
  const isBull = type === "breakout";
  return (
    <tr className="border-b border-white/5 hover:bg-white/3 transition-colors">
      <td className="py-2.5 px-3 font-mono font-bold text-sm text-foreground">{stock.ticker}</td>
      <td className="py-2.5 px-3 font-mono text-sm">${stock.price.toFixed(2)}</td>
      <td className={`py-2.5 px-3 font-mono text-sm font-medium ${stock.priceChangePct >= 0 ? "text-bullish" : "text-bearish"}`}>
        {stock.priceChangePct >= 0 ? "+" : ""}{stock.priceChangePct.toFixed(2)}%
      </td>
      <td className="py-2.5 px-3 font-mono text-sm">
        <span className={stock.rsi > 50 ? "text-bullish" : "text-bearish"}>
          {stock.rsi.toFixed(1)}
        </span>
      </td>
      <td className="py-2.5 px-3 font-mono text-sm">
        <span className={stock.macdHist > stock.macdHistPrev ? "text-bullish" : "text-bearish"}>
          {stock.macdHist.toFixed(3)}
        </span>
      </td>
      <td className="py-2.5 px-3 font-mono text-sm">
        <span className={stock.volumeRatio >= 1.5 ? "text-bullish font-bold" : "text-muted-foreground"}>
          {stock.volumeRatio.toFixed(2)}×
        </span>
      </td>
      <td className="py-2.5 px-3">
        <SignalBadge strength={stock.strength} />
      </td>
    </tr>
  );
}

function StockTable({
  title,
  stocks,
  type,
  icon,
  color,
}: {
  title: string;
  stocks: ScannerStock[];
  type: "breakout" | "breakdown";
  icon: React.ReactNode;
  color: string;
}) {
  return (
    <div className="glass-panel rounded-2xl overflow-hidden">
      <div className={`px-4 py-3 flex items-center gap-2 border-b border-white/10 ${color}`}>
        {icon}
        <span className="font-semibold text-sm">{title}</span>
        <span className="ml-auto text-xs text-muted-foreground font-mono">{stocks.length} stocks</span>
      </div>
      {stocks.length === 0 ? (
        <div className="px-4 py-8 text-center text-muted-foreground text-sm">
          No {type === "breakout" ? "breakouts" : "breakdowns"} detected
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-white/10">
                {["Ticker", "Price", "Chg%", "RSI", "MACD Hist", "Vol Ratio", "Signal"].map(h => (
                  <th key={h} className="py-2 px-3 text-[10px] uppercase tracking-wider text-muted-foreground font-medium">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {stocks.map(s => (
                <StockRow key={s.ticker} stock={s} type={type} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export function ScannerTab() {
  const [pollInterval, setPollInterval] = useState<ScannerInterval>(15);
  const { data, isLoading, isError, refetch, isFetching } = useScanner(pollInterval);

  return (
    <div className="space-y-4">
      {/* Header controls */}
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        className="glass-panel rounded-2xl px-4 py-3 flex flex-wrap items-center gap-3 justify-between"
      >
        <div className="flex items-center gap-2">
          <TrendingUp className="w-4 h-4 text-primary" />
          <span className="font-semibold text-sm">Breakout / Breakdown Scanner</span>
          <span className="text-[10px] text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
            Large &amp; Mega Cap
          </span>
        </div>

        <div className="flex items-center gap-3">
          {/* Interval dropdown */}
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Clock className="w-3.5 h-3.5" />
            <span>Poll every</span>
          </div>
          <select
            value={pollInterval}
            onChange={e => setPollInterval(Number(e.target.value) as ScannerInterval)}
            className="bg-muted text-foreground text-xs rounded-lg px-2 py-1.5 border border-white/10 focus:outline-none focus:ring-1 focus:ring-primary"
          >
            {INTERVALS.map(i => (
              <option key={i.value} value={i.value}>{i.label}</option>
            ))}
          </select>

          {/* Manual refresh */}
          <button
            onClick={() => refetch()}
            disabled={isFetching}
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isFetching ? "animate-spin" : ""}`} />
            {isFetching ? "Scanning…" : "Refresh"}
          </button>
        </div>
      </motion.div>

      {/* Scan meta */}
      {data && (
        <div className="flex items-center gap-4 text-[11px] text-muted-foreground px-1">
          <span>Scanned {data.totalScanned} tickers</span>
          <span>·</span>
          <span>Last scan: {new Date(data.scannedAt).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })}</span>
          <span>·</span>
          <span>15 min server cache</span>
        </div>
      )}

      {/* Loading state */}
      {isLoading && (
        <div className="glass-panel rounded-2xl px-4 py-16 text-center">
          <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-3 text-primary" />
          <p className="text-sm text-muted-foreground">Scanning 100 large/mega cap stocks…</p>
          <p className="text-xs text-muted-foreground/60 mt-1">First scan takes ~10s</p>
        </div>
      )}

      {/* Error state */}
      {isError && !isLoading && (
        <div className="glass-panel rounded-2xl px-4 py-8 text-center text-bearish text-sm">
          Scanner failed — check TRADIER_API_KEY and try again.
        </div>
      )}

      {/* Tables */}
      {data && !isLoading && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="grid grid-cols-1 gap-4"
        >
          <StockTable
            title="🚀 Breakouts"
            stocks={data.breakouts}
            type="breakout"
            icon={<TrendingUp className="w-4 h-4 text-bullish" />}
            color="text-bullish"
          />
          <StockTable
            title="📉 Breakdowns"
            stocks={data.breakdowns}
            type="breakdown"
            icon={<TrendingDown className="w-4 h-4 text-bearish" />}
            color="text-bearish"
          />
        </motion.div>
      )}
    </div>
  );
}
