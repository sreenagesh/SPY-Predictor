import React from "react";
import { motion } from "framer-motion";
import { TrendingUp, TrendingDown, Minus, RefreshCw, AlertTriangle, Zap, Shield } from "lucide-react";
import { cn } from "@/lib/utils";
import { useOptionsFlow, type OptionsFlowData, type NearAtmOption } from "@/hooks/use-spy";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(n: number, d = 2) {
  return n.toFixed(d);
}

function volBar(vol: number, maxVol: number) {
  const pct = maxVol > 0 ? Math.min((vol / maxVol) * 100, 100) : 0;
  return pct;
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function OptionRow({
  opt,
  maxVol,
  currentPrice,
  isCall,
}: {
  opt: NearAtmOption;
  maxVol: number;
  currentPrice: number;
  isCall: boolean;
}) {
  const isAtm = Math.abs(opt.strike - currentPrice) < 0.5;
  const barPct = volBar(opt.volume, maxVol);
  const barColor = isCall ? "bg-bullish/60" : "bg-bearish/60";

  return (
    <tr className={cn("text-xs border-b border-white/5", isAtm && "bg-white/5")}>
      <td className="py-1.5 px-2 font-mono font-bold text-foreground">
        {opt.strike}
        {isAtm && <span className="ml-1 text-[9px] text-neutral font-semibold">ATM</span>}
      </td>
      <td className="py-1.5 px-2 text-right font-mono text-muted-foreground">${fmt(opt.bid)}</td>
      <td className="py-1.5 px-2 text-right font-mono text-foreground">${fmt(opt.ask)}</td>
      <td className="py-1.5 px-2 min-w-[80px]">
        <div className="flex items-center gap-1.5">
          <div className="flex-1 h-1.5 bg-white/10 rounded-full overflow-hidden">
            <div className={cn("h-full rounded-full", barColor)} style={{ width: `${barPct}%` }} />
          </div>
          <span className="font-mono text-[10px] text-foreground w-12 text-right">
            {opt.volume >= 1000 ? `${(opt.volume / 1000).toFixed(1)}k` : opt.volume}
          </span>
        </div>
      </td>
      <td className="py-1.5 px-2 text-right font-mono text-muted-foreground/70 text-[10px]">
        {opt.openInterest >= 1000 ? `${(opt.openInterest / 1000).toFixed(1)}k` : opt.openInterest}
      </td>
    </tr>
  );
}

function ChainTable({
  options,
  currentPrice,
  isCall,
  label,
}: {
  options: NearAtmOption[];
  currentPrice: number;
  isCall: boolean;
  label: string;
}) {
  const maxVol = Math.max(...options.map(o => o.volume), 1);
  const headerColor = isCall ? "text-bullish" : "text-bearish";

  return (
    <div className="flex-1 min-w-0">
      <div className={cn("text-[10px] font-bold uppercase tracking-widest mb-1 px-2", headerColor)}>
        {label}
      </div>
      <table className="w-full">
        <thead>
          <tr className="text-[9px] uppercase tracking-wider text-muted-foreground/50 border-b border-white/10">
            <th className="py-1 px-2 text-left">Strike</th>
            <th className="py-1 px-2 text-right">Bid</th>
            <th className="py-1 px-2 text-right">Ask</th>
            <th className="py-1 px-2 text-left">Volume</th>
            <th className="py-1 px-2 text-right">OI</th>
          </tr>
        </thead>
        <tbody>
          {options.map(opt => (
            <OptionRow
              key={opt.strike}
              opt={opt}
              maxVol={maxVol}
              currentPrice={currentPrice}
              isCall={isCall}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function StatPill({ label, value, highlight }: { label: string; value: string; highlight?: "bull" | "bear" | "neutral" }) {
  const color = highlight === "bull" ? "text-bullish" : highlight === "bear" ? "text-bearish" : "text-foreground";
  return (
    <div className="flex flex-col items-center bg-black/30 rounded-xl px-4 py-2 border border-white/10">
      <span className="text-[9px] uppercase tracking-widest text-muted-foreground/60 mb-0.5">{label}</span>
      <span className={cn("font-mono font-bold text-sm", color)}>{value}</span>
    </div>
  );
}

// ─── Main Panel ───────────────────────────────────────────────────────────────

export function OptionsFlowPanel() {
  const { data, isLoading, isError, refetch, isFetching } = useOptionsFlow();

  const signal = data?.signal ?? "WAIT";
  const isCall = signal === "BUY CALL";
  const isPut  = signal === "BUY PUT";
  const isWait = signal === "WAIT";

  const signalColor = isCall ? "text-bullish" : isPut ? "text-bearish" : "text-neutral";
  const signalBg    = isCall
    ? "bg-bullish/10 border-bullish/30 shadow-[0_0_40px_rgba(22,163,74,0.15)]"
    : isPut
    ? "bg-bearish/10 border-bearish/30 shadow-[0_0_40px_rgba(225,29,72,0.15)]"
    : "bg-neutral/10 border-neutral/30";
  const headerBar = isCall ? "bg-bullish" : isPut ? "bg-bearish" : "bg-neutral";
  const SignalIcon = isCall ? TrendingUp : isPut ? TrendingDown : Minus;

  return (
    <div className={cn("rounded-2xl border-2 overflow-hidden", signalBg)}>
      {/* Colored top bar */}
      <div className={cn("h-2 w-full", headerBar)} />

      <div className="p-5 space-y-5">

        {/* Header row */}
        <div className="flex items-center justify-between">
          <h2 className="text-xs font-bold uppercase tracking-widest text-muted-foreground flex items-center gap-2">
            <Zap className="w-4 h-4 text-primary" /> 0DTE Options Flow
          </h2>
          <button
            onClick={() => refetch()}
            disabled={isFetching}
            className="flex items-center gap-1.5 text-[10px] text-muted-foreground hover:text-foreground transition-colors"
          >
            <RefreshCw className={cn("w-3 h-3", isFetching && "animate-spin")} />
            Refresh
          </button>
        </div>

        {isLoading && (
          <div className="h-32 flex items-center justify-center text-muted-foreground text-sm">
            Loading options flow…
          </div>
        )}

        {isError && (
          <div className="flex items-center gap-2 text-destructive text-sm p-3 bg-destructive/10 rounded-xl">
            <AlertTriangle className="w-4 h-4 flex-shrink-0" />
            Failed to load — check TRADIER_API_KEY is set on Replit.
          </div>
        )}

        {data && (
          <>
            {/* ── Big signal banner ── */}
            <motion.div
              key={signal}
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="flex flex-col sm:flex-row items-center sm:items-start gap-4"
            >
              <div className="flex items-center gap-3">
                <motion.div
                  animate={{ scale: [1, 1.2, 1], opacity: [0.6, 1, 0.6] }}
                  transition={{ repeat: Infinity, duration: 2 }}
                  className={cn("w-4 h-4 rounded-full", isCall ? "bg-bullish" : isPut ? "bg-bearish" : "bg-neutral")}
                />
                <span className={cn("text-5xl font-black font-display tracking-tight leading-none", signalColor)}>
                  {signal}
                </span>
              </div>

              {!isWait && (
                <div className={cn(
                  "flex-1 rounded-xl border p-3 text-sm font-semibold leading-snug",
                  isCall ? "bg-bullish/10 border-bullish/20 text-bullish" : "bg-bearish/10 border-bearish/20 text-bearish"
                )}>
                  <SignalIcon className="w-4 h-4 inline mr-1.5 mb-0.5" />
                  {data.instruction}
                </div>
              )}

              {isWait && (
                <div className="flex-1 rounded-xl border border-neutral/20 bg-neutral/5 p-3 text-sm text-muted-foreground leading-snug">
                  <Shield className="w-4 h-4 inline mr-1.5 mb-0.5 text-neutral" />
                  {data.instruction}
                </div>
              )}
            </motion.div>

            {/* ── Key stats row ── */}
            <div className="flex flex-wrap gap-2">
              <StatPill
                label="P/C Ratio (ATM)"
                value={fmt(data.nearAtmPcRatio)}
                highlight={data.nearAtmPcRatio < 0.9 ? "bull" : data.nearAtmPcRatio > 1.1 ? "bear" : "neutral"}
              />
              <StatPill
                label="P/C Overall"
                value={fmt(data.overallPcRatio)}
                highlight={data.overallPcRatio < 0.9 ? "bull" : data.overallPcRatio > 1.2 ? "bear" : "neutral"}
              />
              {data.maxPain !== null && (
                <StatPill label="Max Pain" value={`$${data.maxPain}`} highlight="neutral" />
              )}
              {data.callWall !== null && (
                <StatPill label="Call Wall" value={`$${data.callWall}`} highlight="bear" />
              )}
              {data.putWall !== null && (
                <StatPill label="Put Wall" value={`$${data.putWall}`} highlight="bull" />
              )}
              <StatPill label="Expiry" value={
                new Date(data.expiration + "T00:00:00Z").toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" })
              } />
            </div>

            {/* ── Near-ATM chain tables ── */}
            <div className="flex gap-4 overflow-x-auto">
              <ChainTable
                options={data.calls}
                currentPrice={data.currentPrice}
                isCall={true}
                label="Calls"
              />
              <div className="w-px bg-white/10 flex-shrink-0" />
              <ChainTable
                options={data.puts}
                currentPrice={data.currentPrice}
                isCall={false}
                label="Puts"
              />
            </div>

            {/* Footer */}
            <div className="text-[10px] text-muted-foreground/40 text-right">
              SPY ${fmt(data.currentPrice)} · Score {data.signalScore > 0 ? "+" : ""}{data.signalScore} ·{" "}
              {new Date(data.scannedAt).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
