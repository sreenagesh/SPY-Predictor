import React, { useState } from "react";
import { motion } from "framer-motion";
import {
  useSpyData,
  useSpyPrediction,
  useIntradaySignal,
  useSwingSignal,
  type TimePeriod,
} from "@/hooks/use-spy";
import { formatCurrency, formatPercentage } from "@/lib/utils";
import { PriceChart } from "@/components/price-chart";
import { PredictionWidget } from "@/components/prediction-widget";
import { IndicatorsGrid } from "@/components/indicators-grid";
import { PriceTargetsCard } from "@/components/price-targets";
import { ScalpTargetsCard } from "@/components/scalp-targets";
import { TradingSignalCard } from "@/components/trading-signal";
import { LoadingSpinner } from "@/components/ui-elements";

export default function Dashboard() {
  const [period, setPeriod] = useState<TimePeriod>("6mo");

  const { data: spyData, isLoading: loadingData, error: dataError } = useSpyData(period);
  const { data: prediction, isLoading: loadingPrediction, error: predError } = useSpyPrediction();
  const { data: intradaySignal, isLoading: loadingIntraday } = useIntradaySignal();
  const { data: swingSignal, isLoading: loadingSwing } = useSwingSignal();

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
    <div className="space-y-6">
      {/* Header Metrics */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          {
            label: "SPY Current",
            value: spyData?.currentPrice ? formatCurrency(spyData.currentPrice) : "---",
            sub: "Live Data",
          },
          {
            label: `${period.toUpperCase()} Change`,
            value: spyData?.priceChangePct ? formatPercentage(spyData.priceChangePct) : "---",
            sub: spyData?.priceChange ? formatCurrency(spyData.priceChange) : "---",
            isPos: (spyData?.priceChangePct || 0) > 0,
            isNeg: (spyData?.priceChangePct || 0) < 0,
          },
          {
            label: "Last Updated",
            value: prediction?.timestamp
              ? new Date(prediction.timestamp).toLocaleTimeString()
              : "---",
            sub: "Model Sync",
          },
          { label: "Model Version", value: "Quant-v4.2", sub: "Stable" },
        ].map((stat, i) => (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.1 }}
            key={i}
            className="glass-panel p-4 rounded-2xl flex flex-col"
          >
            <span className="text-xs text-muted-foreground font-medium uppercase tracking-wider mb-1">
              {stat.label}
            </span>
            <span
              className={`text-2xl font-mono font-bold ${
                stat.isPos ? "text-bullish" : stat.isNeg ? "text-bearish" : "text-foreground"
              }`}
            >
              {stat.value}
            </span>
            <span className="text-xs text-muted-foreground mt-1">{stat.sub}</span>
          </motion.div>
        ))}
      </div>

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
        </div>
      )}
    </div>
  );
}
