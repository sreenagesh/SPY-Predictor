import React, { useState } from "react";
import { motion } from "framer-motion";
import {
  useSpyData,
  useSpyPrediction,
  useIntradaySignal,
  useSwingSignal,
  useMtfAnalysis,
  type TimePeriod,
} from "@/hooks/use-spy";
import { formatCurrency, formatPercentage } from "@/lib/utils";
import { PriceChart } from "@/components/price-chart";
import { PredictionWidget } from "@/components/prediction-widget";
import { IndicatorsGrid } from "@/components/indicators-grid";
import { PriceTargetsCard } from "@/components/price-targets";
import { ScalpTargetsCard } from "@/components/scalp-targets";
import { TradingSignalCard } from "@/components/trading-signal";
import { MtfPanel } from "@/components/mtf-panel";
import { LoadingSpinner } from "@/components/ui-elements";

export default function Dashboard() {
  const [period, setPeriod] = useState<TimePeriod>("6mo");

  const { data: spyData, isLoading: loadingData, error: dataError } = useSpyData(period);
  const { data: prediction, isLoading: loadingPrediction, error: predError } = useSpyPrediction();
  const { data: intradaySignal, isLoading: loadingIntraday } = useIntradaySignal();
  const { data: swingSignal, isLoading: loadingSwing } = useSwingSignal();
  const { data: mtfData, isLoading: loadingMtf } = useMtfAnalysis();

  const isError = dataError || predError;
  const isLoading = loadingData || loadingPrediction;

  if (isError) {
    return (
      <div className="w-full h-[60vh] flex flex-col items-center justify-center">
        <div className="bg-destructive/10 text-destructive border border-destructive/20 p-6 rounded-2xl max-w-md text-center">
          <h2 className="text-xl font-bold mb-2">Connection Error</h2>
          <p className="text-sm opacity-80">
            Failed to connect to the predictive model API. Please try again later or check your backend services.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Compact header bar */}
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        className="glass-panel rounded-2xl px-4 py-3 flex items-center justify-between flex-wrap gap-3"
      >
        <div className="flex items-center gap-4 flex-wrap">
          {/* SPY price */}
          <div className="flex items-baseline gap-2">
            <span className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">SPY</span>
            <span className="text-2xl font-mono font-black text-foreground">
              {spyData?.currentPrice ? formatCurrency(spyData.currentPrice) : "---"}
            </span>
          </div>
          {/* Change */}
          {spyData?.priceChangePct != null && (
            <div className="flex items-baseline gap-1.5">
              <span className={`text-sm font-bold font-mono ${spyData.priceChangePct >= 0 ? "text-bullish" : "text-bearish"}`}>
                {formatPercentage(spyData.priceChangePct)}
              </span>
              <span className={`text-xs font-mono ${spyData.priceChangePct >= 0 ? "text-bullish/70" : "text-bearish/70"}`}>
                ({spyData.priceChange >= 0 ? "+" : ""}{formatCurrency(spyData.priceChange)})
              </span>
              <span className="text-[10px] text-muted-foreground/50">{period.toUpperCase()}</span>
            </div>
          )}
        </div>
        {/* Updated time */}
        {intradaySignal?.timestamp && (
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground/60">
            <span className="w-1.5 h-1.5 rounded-full bg-bullish animate-pulse" />
            <span>Live · {new Date(intradaySignal.timestamp).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })}</span>
          </div>
        )}
      </motion.div>

      {isLoading && !spyData && !prediction ? (
        <LoadingSpinner className="h-[400px]" />
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">

          {/* ── Trading Signal — CALL/PUT Mode Switcher (top priority) ── */}
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, type: "spring", bounce: 0.3 }}
            className="col-span-1 lg:col-span-12"
          >
            <TradingSignalCard
              intradaySignal={intradaySignal}
              swingSignal={swingSignal}
              isLoadingIntraday={loadingIntraday}
              isLoadingSwing={loadingSwing}
            />
          </motion.div>

          {/* ── Main Price Chart ── */}
          {spyData && (
            <motion.div
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.4, delay: 0.1 }}
              className="col-span-1 lg:col-span-8"
            >
              <PriceChart
                data={spyData.bars}
                period={period}
                onPeriodChange={setPeriod}
                isLoading={loadingData}
              />
            </motion.div>
          )}

          {/* ── AI Prediction Widget ── */}
          {prediction && (
            <motion.div
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.4, delay: 0.2 }}
              className="col-span-1 lg:col-span-4 flex flex-col"
            >
              <PredictionWidget
                prediction={prediction.prediction as any}
                confidence={prediction.confidence}
                summary={prediction.summary}
                updatedAt={prediction.timestamp}
              />
            </motion.div>
          )}

          {/* ── Technical Indicators ── */}
          {prediction?.indicators && (
            <motion.div
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.4, delay: 0.3 }}
              className="col-span-1 lg:col-span-12"
            >
              <IndicatorsGrid indicators={prediction.indicators as any} />
            </motion.div>
          )}

          {/* ── Price Targets ── */}
          {prediction?.priceTargets && (
            <motion.div
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.4, delay: 0.4 }}
              className="col-span-1 lg:col-span-12"
            >
              <PriceTargetsCard
                targets={prediction.priceTargets}
                currentPrice={prediction.currentPrice}
              />
            </motion.div>
          )}

          {/* ── Scalp Targets (momentum-driven) ── */}
          {prediction?.scalpTargets && (
            <motion.div
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.4, delay: 0.5 }}
              className="col-span-1 lg:col-span-12"
            >
              <ScalpTargetsCard
                scalpTargets={prediction.scalpTargets as any}
                currentPrice={prediction.currentPrice}
              />
            </motion.div>
          )}

          {/* ── Multi-Timeframe + 0DTE Intelligence ── */}
          <motion.div
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.4, delay: 0.6 }}
            className="col-span-1 lg:col-span-12"
          >
            <MtfPanel data={mtfData} isLoading={loadingMtf} />
          </motion.div>
        </div>
      )}
    </div>
  );
}
