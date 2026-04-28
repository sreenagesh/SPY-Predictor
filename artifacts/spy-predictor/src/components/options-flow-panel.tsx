import React, { useRef, useEffect } from "react";
import { motion } from "framer-motion";
import {
  TrendingUp, TrendingDown, Minus, RefreshCw, AlertTriangle,
  Zap, Shield, Target, ArrowRight, Clock, Activity,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useOptionsFlow, useGex, type OptionsFlowData, type NearAtmOption, type GexData } from "@/hooks/use-spy";

// ─── localStorage recording ───────────────────────────────────────────────────

const STORAGE_KEY = "spy_trade_log_v1";

function recordOptionsFlowSignal(data: OptionsFlowData) {
  try {
    const all = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]");
    const id = `options-flow_${data.scannedAt}`;
    if (all.find((r: any) => r.id === id)) return; // already recorded

    all.push({
      id,
      mode: "options-flow",
      signal: data.signal === "BUY CALL" ? "CALL" : "PUT",
      outcome: "open",
      ts: data.scannedAt,
      details: {
        strike:       data.recommendedStrike,
        expiration:   data.expiration,
        dte:          0,
        entryPrice:   data.currentPrice,           // SPY price at proposal
        t1Price:      data.t1SpyPrice,             // SPY T1 target (OI wall)
        t2Price:      data.t2SpyPrice,             // SPY T2 target
        stopPrice:    null,
        entryPremium: data.recommendedEntry,
        t1Premium:    data.t1Premium,
        t2Premium:    data.t2Premium,
        stopPremium:  data.recommendedStop,
      },
    });
    localStorage.setItem(STORAGE_KEY, JSON.stringify(all.slice(-500)));
  } catch {
    // ignore storage errors
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(n: number, d = 2) { return n.toFixed(d); }

function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function fmtExp(dateStr: string) {
  return new Date(dateStr + "T00:00:00Z").toLocaleDateString("en-US", {
    month: "short", day: "numeric", timeZone: "UTC",
  });
}

// ─── Option row ───────────────────────────────────────────────────────────────

function OptionRow({ opt, maxVol, currentPrice, isCall }: {
  opt: NearAtmOption; maxVol: number; currentPrice: number; isCall: boolean;
}) {
  const isAtm = Math.abs(opt.strike - currentPrice) < 0.5;
  const barPct = maxVol > 0 ? Math.min((opt.volume / maxVol) * 100, 100) : 0;

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
            <div
              className={cn("h-full rounded-full", isCall ? "bg-bullish/60" : "bg-bearish/60")}
              style={{ width: `${barPct}%` }}
            />
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

function ChainTable({ options, currentPrice, isCall, label }: {
  options: NearAtmOption[]; currentPrice: number; isCall: boolean; label: string;
}) {
  const maxVol = Math.max(...options.map(o => o.volume), 1);
  return (
    <div className="flex-1 min-w-0">
      <div className={cn("text-[10px] font-bold uppercase tracking-widest mb-1 px-2", isCall ? "text-bullish" : "text-bearish")}>
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
            <OptionRow key={opt.strike} opt={opt} maxVol={maxVol} currentPrice={currentPrice} isCall={isCall} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function StatPill({ label, value, highlight }: {
  label: string; value: string; highlight?: "bull" | "bear" | "neutral";
}) {
  const color = highlight === "bull" ? "text-bullish" : highlight === "bear" ? "text-bearish" : "text-foreground";
  return (
    <div className="flex flex-col items-center bg-black/30 rounded-xl px-3 py-2 border border-white/10">
      <span className="text-[9px] uppercase tracking-widest text-muted-foreground/60 mb-0.5">{label}</span>
      <span className={cn("font-mono font-bold text-sm", color)}>{value}</span>
    </div>
  );
}

// ─── Target row ───────────────────────────────────────────────────────────────

function TargetRow({ label, spyPrice, premium, color, icon }: {
  label: string; spyPrice: number | null; premium: number | null;
  color: string; icon: React.ReactNode;
}) {
  if (!spyPrice) return null;
  return (
    <div className={cn("flex items-center gap-3 px-4 py-2.5 rounded-xl border", color)}>
      <div className="flex-shrink-0">{icon}</div>
      <div className="flex-1 flex flex-wrap items-center gap-x-4 gap-y-0.5">
        <span className="text-xs font-bold uppercase tracking-wider opacity-70">{label}</span>
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-muted-foreground">SPY</span>
          <span className="font-mono font-black text-base">${spyPrice}</span>
        </div>
        {premium !== null && (
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-muted-foreground">Est. premium</span>
            <span className="font-mono font-bold text-sm">~${fmt(premium)}</span>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── GEX helpers ─────────────────────────────────────────────────────────────

function fmtGex(n: number): string {
  const sign = n >= 0 ? "+" : "-";
  const abs = Math.abs(n);
  if (abs >= 1_000_000_000) return `${sign}$${(abs / 1_000_000_000).toFixed(1)}B`;
  if (abs >= 1_000_000)     return `${sign}$${(abs / 1_000_000).toFixed(0)}M`;
  return `${sign}$${abs.toFixed(0)}`;
}

// ─── Gamma Guidance section ───────────────────────────────────────────────────

function GammaGuidanceSection({ gex }: { gex: GexData }) {
  const biasColor =
    gex.guidanceBias === "bull"
      ? "bg-bullish/5 border-bullish/20 text-bullish/90"
      : gex.guidanceBias === "bear"
      ? "bg-bearish/5 border-bearish/20 text-bearish/90"
      : "bg-white/5 border-white/10 text-muted-foreground";

  const gexColor = gex.totalGex >= 0 ? "text-bullish" : "text-bearish";

  return (
    <div className="border-t border-white/10 pt-4 space-y-3">
      {/* Header row */}
      <div className="flex items-center justify-between">
        <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/50 flex items-center gap-1.5">
          <Activity className="w-3 h-3" /> Gamma Guidance
        </p>
        <div className="flex items-center gap-2">
          <span className="text-[9px] px-2 py-0.5 rounded-full bg-black/30 border border-white/10 text-muted-foreground/60 uppercase font-mono tracking-wider">
            {gex.regime}
          </span>
          <span className={cn("font-mono font-bold text-xs", gexColor)}>
            {fmtGex(gex.totalGex)} GEX
          </span>
        </div>
      </div>

      {/* Guidance text */}
      <div className={cn("rounded-xl border p-3 text-xs leading-relaxed", biasColor)}>
        {gex.guidance}
      </div>

      {/* Key GEX levels */}
      <div className="flex flex-wrap gap-2">
        {gex.gammaFlip !== null && (
          <StatPill
            label="Gamma Flip"
            value={`$${gex.gammaFlip}`}
            highlight={gex.aboveFlip ? "bull" : "bear"}
          />
        )}
        <StatPill
          label="GEX Regime"
          value={gex.totalGex >= 0 ? "Long Gamma" : "Short Gamma"}
          highlight={gex.totalGex >= 0 ? "bull" : "bear"}
        />
        {gex.callWall !== null && (
          <StatPill label="Call Wall (γ)" value={`$${gex.callWall}`} highlight="bear" />
        )}
        {gex.putWall !== null && (
          <StatPill label="Put Wall (γ)" value={`$${gex.putWall}`} highlight="bull" />
        )}
        {gex.maxPain !== null && (
          <StatPill label="Max Pain (γ)" value={`$${gex.maxPain}`} />
        )}
      </div>

      <div className="text-[10px] text-muted-foreground/30 text-right">
        GEX · {new Date(gex.scannedAt).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
      </div>
    </div>
  );
}

// ─── Main Panel ───────────────────────────────────────────────────────────────

export function OptionsFlowPanel() {
  const { data, isLoading, isError, refetch, isFetching } = useOptionsFlow();
  const { data: gexData, isLoading: gexLoading, isError: gexError } = useGex();
  const prevSignalRef = useRef<string>("WAIT");

  // Auto-record to localStorage when signal fires (WAIT → BUY)
  useEffect(() => {
    if (!data) return;
    const prev = prevSignalRef.current;
    const curr = data.signal;
    if (curr !== "WAIT" && prev === "WAIT") {
      recordOptionsFlowSignal(data);
    }
    prevSignalRef.current = curr;
  }, [data?.scannedAt, data?.signal]);

  const signal  = data?.signal ?? "WAIT";
  const isCall  = signal === "BUY CALL";
  const isPut   = signal === "BUY PUT";
  const isWait  = signal === "WAIT";

  const signalColor = isCall ? "text-bullish" : isPut ? "text-bearish" : "text-neutral";
  const signalBg    = isCall
    ? "bg-bullish/10 border-bullish/30 shadow-[0_0_40px_rgba(22,163,74,0.15)]"
    : isPut
    ? "bg-bearish/10 border-bearish/30 shadow-[0_0_40px_rgba(225,29,72,0.15)]"
    : "bg-neutral/10 border-neutral/30";
  const headerBar   = isCall ? "bg-bullish" : isPut ? "bg-bearish" : "bg-neutral";
  const SignalIcon  = isCall ? TrendingUp : isPut ? TrendingDown : Minus;

  return (
    <div className={cn("rounded-2xl border-2 overflow-hidden", signalBg)}>
      <div className={cn("h-2 w-full", headerBar)} />

      <div className="p-5 space-y-4">

        {/* ── Header ── */}
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
            {/* ── SPY price + timestamp bar ── */}
            <div className="flex flex-wrap items-center gap-4 px-3 py-2 bg-black/30 rounded-xl border border-white/10 text-xs">
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground/60 uppercase tracking-wider text-[10px]">SPY</span>
                <span className="font-mono font-black text-lg text-foreground">${fmt(data.currentPrice)}</span>
              </div>
              {signal !== "WAIT" && (
                <>
                  <div className="w-px h-4 bg-white/10" />
                  <div className="flex items-center gap-1.5">
                    <span className="text-muted-foreground/60 text-[10px]">Proposed at</span>
                    <span className="font-mono font-bold text-foreground">${fmt(data.currentPrice)}</span>
                  </div>
                </>
              )}
              <div className="w-px h-4 bg-white/10" />
              <div className="flex items-center gap-1.5 text-muted-foreground/60">
                <Clock className="w-3 h-3" />
                <span>{fmtTime(data.scannedAt)}</span>
              </div>
              <div className="w-px h-4 bg-white/10" />
              <span className="text-muted-foreground/50">Exp: {fmtExp(data.expiration)}</span>
            </div>

            {/* ── Big signal + instruction ── */}
            <motion.div
              key={signal}
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="flex flex-col sm:flex-row items-start gap-4"
            >
              <div className="flex items-center gap-3 flex-shrink-0">
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
                  isCall ? "bg-bullish/10 border-bullish/20 text-bullish" : "bg-bearish/10 border-bearish/20 text-bearish",
                )}>
                  <SignalIcon className="w-4 h-4 inline mr-1.5 mb-0.5" />
                  {data.instruction}
                </div>
              )}

              {isWait && (
                <div className="flex-1 rounded-xl border border-neutral/20 bg-neutral/5 p-3 text-sm text-muted-foreground">
                  <Shield className="w-4 h-4 inline mr-1.5 mb-0.5 text-neutral" />
                  No clear edge — wait for a cleaner setup.
                </div>
              )}
            </motion.div>

            {/* ── T1 / T2 / Stop targets ── */}
            {!isWait && (
              <div className="space-y-2">
                <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/50 flex items-center gap-1.5">
                  <Target className="w-3 h-3" /> Price Targets (OI Wall-based)
                </p>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  {/* Entry */}
                  <div className="flex items-center gap-3 px-4 py-2.5 rounded-xl border border-blue-500/20 bg-blue-500/5">
                    <ArrowRight className="w-4 h-4 text-blue-400 flex-shrink-0" />
                    <div className="flex flex-col">
                      <span className="text-[10px] text-blue-400/70 uppercase tracking-wider font-bold">Entry Premium</span>
                      <span className="font-mono font-black text-base text-blue-400">
                        ${data.recommendedEntry !== null ? fmt(data.recommendedEntry) : "—"}
                      </span>
                      <span className="text-[10px] text-muted-foreground/50">
                        SPY ${fmt(data.currentPrice)} · Strike ${data.recommendedStrike ?? "—"}
                      </span>
                    </div>
                  </div>

                  {/* T1 */}
                  <TargetRow
                    label="T1 — OI Wall"
                    spyPrice={data.t1SpyPrice}
                    premium={data.t1Premium}
                    color="border-emerald-500/20 bg-emerald-500/5 text-emerald-400"
                    icon={<Target className="w-4 h-4 text-emerald-400" />}
                  />

                  {/* T2 */}
                  <TargetRow
                    label="T2 — Max Pain / Extended"
                    spyPrice={data.t2SpyPrice}
                    premium={data.t2Premium}
                    color="border-yellow-500/20 bg-yellow-500/5 text-yellow-400"
                    icon={<Target className="w-4 h-4 text-yellow-400" />}
                  />
                </div>

                {/* Stop */}
                <div className="flex items-center gap-3 px-4 py-2 rounded-xl border border-red-500/20 bg-red-500/5">
                  <Shield className="w-4 h-4 text-red-400 flex-shrink-0" />
                  <span className="text-[10px] text-red-400/70 uppercase tracking-wider font-bold">Stop Loss (premium)</span>
                  <span className="font-mono font-black text-base text-red-400 ml-2">
                    ${data.recommendedStop !== null ? fmt(data.recommendedStop) : "—"}
                  </span>
                  <span className="text-[10px] text-muted-foreground/50 ml-1">(45% of entry)</span>
                </div>
              </div>
            )}

            {/* ── Stat pills ── */}
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
              {data.maxPain !== null && <StatPill label="Max Pain" value={`$${data.maxPain}`} />}
              {data.callWall !== null && <StatPill label="Call Wall" value={`$${data.callWall}`} highlight="bear" />}
              {data.putWall  !== null && <StatPill label="Put Wall"  value={`$${data.putWall}`}  highlight="bull" />}
            </div>

            {/* ── Chain tables ── */}
            <div className="flex gap-4 overflow-x-auto">
              <ChainTable options={data.calls} currentPrice={data.currentPrice} isCall={true}  label="Calls" />
              <div className="w-px bg-white/10 flex-shrink-0" />
              <ChainTable options={data.puts}  currentPrice={data.currentPrice} isCall={false} label="Puts" />
            </div>

            {/* ── Gamma Guidance ── */}
            {gexLoading && (
              <div className="border-t border-white/10 pt-4 text-xs text-muted-foreground/40 flex items-center gap-2">
                <Activity className="w-3 h-3 animate-pulse" /> Loading gamma data…
              </div>
            )}
            {gexError && (
              <div className="border-t border-white/10 pt-4 text-[10px] text-muted-foreground/30 flex items-center gap-1.5">
                <AlertTriangle className="w-3 h-3" /> Gamma Guidance unavailable — check TRADIER_API_KEY
              </div>
            )}
            {gexData && !gexLoading && <GammaGuidanceSection gex={gexData} />}

            {/* Footer */}
            <div className="text-[10px] text-muted-foreground/40 text-right">
              Score {data.signalScore > 0 ? "+" : ""}{data.signalScore} · {fmtTime(data.scannedAt)}
              {signal !== "WAIT" && " · Recorded to Trade History"}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
