import { Router, type IRouter } from "express";
import {
  GetSpyDataResponse,
  GetSpyPredictionResponse,
} from "@workspace/api-zod";
import {
  fetchSpyHistory,
  computeRsi,
  computeSma,
  computeMacd,
  computeBollingerBands,
} from "../lib/spy-data.js";

const router: IRouter = Router();

router.get("/spy/data", async (req, res): Promise<void> => {
  try {
    const period = (req.query.period as string) || "6mo";
    const validPeriods = ["1mo", "3mo", "6mo", "1y", "2y"];
    const safePeriod = validPeriods.includes(period) ? period : "6mo";

    const bars = await fetchSpyHistory(safePeriod);

    if (bars.length === 0) {
      res.status(500).json({ error: "No data available" });
      return;
    }

    const firstClose = bars[0].close;
    const lastClose = bars[bars.length - 1].close;
    const priceChange = lastClose - firstClose;
    const priceChangePct = (priceChange / firstClose) * 100;

    const data = GetSpyDataResponse.parse({
      symbol: "SPY",
      period: safePeriod,
      bars,
      currentPrice: lastClose,
      priceChange,
      priceChangePct,
    });

    res.json(data);
  } catch (err) {
    console.error("Error fetching SPY data:", err);
    res.status(500).json({ error: "Failed to fetch market data" });
  }
});

router.get("/spy/prediction", async (_req, res): Promise<void> => {
  try {
    const bars = await fetchSpyHistory("6mo");

    if (bars.length < 30) {
      res.status(500).json({ error: "Insufficient data for prediction" });
      return;
    }

    const closes = bars.map((b) => b.close);
    const currentPrice = closes[closes.length - 1];

    const rsi = computeRsi(closes, 14);
    const sma20 = computeSma(closes, 20);
    const sma50 = computeSma(closes, 50);
    const sma200 = computeSma(closes, Math.min(200, closes.length));
    const macd = computeMacd(closes);
    const bb = computeBollingerBands(closes, 20);

    const rsiSignal = rsi < 35 ? "bullish" : rsi > 65 ? "bearish" : "neutral";
    const smaSignal =
      currentPrice > sma20 && sma20 > sma50 ? "bullish" :
      currentPrice < sma20 && sma20 < sma50 ? "bearish" : "neutral";
    const macdSignal = macd.histogram > 0 ? "bullish" : macd.histogram < -0.5 ? "bearish" : "neutral";
    const bbSignal =
      bb.percentB < 0.2 ? "bullish" :
      bb.percentB > 0.8 ? "bearish" : "neutral";
    const goldenCrossSignal = sma50 > sma200 ? "bullish" : "bearish";

    const signals = [rsiSignal, smaSignal, macdSignal, bbSignal, goldenCrossSignal];
    const bullishCount = signals.filter((s) => s === "bullish").length;
    const bearishCount = signals.filter((s) => s === "bearish").length;

    let prediction: "bullish" | "bearish" | "neutral";
    let confidence: number;

    if (bullishCount > bearishCount + 1) {
      prediction = "bullish";
      confidence = 50 + bullishCount * 8 + (rsi < 40 ? 10 : 0);
    } else if (bearishCount > bullishCount + 1) {
      prediction = "bearish";
      confidence = 50 + bearishCount * 8 + (rsi > 60 ? 10 : 0);
    } else {
      prediction = "neutral";
      confidence = 40 + Math.abs(bullishCount - bearishCount) * 5;
    }
    confidence = Math.min(Math.max(confidence, 35), 92);

    const recentBars = bars.slice(-20);
    const support = Math.min(...recentBars.map((b) => b.low));
    const resistance = Math.max(...recentBars.map((b) => b.high));
    const range = resistance - support;
    const upside = prediction === "bullish"
      ? currentPrice + range * 0.6
      : currentPrice + range * 0.3;
    const downside = prediction === "bearish"
      ? currentPrice - range * 0.6
      : currentPrice - range * 0.3;

    const summaryParts: string[] = [];
    if (prediction === "bullish") {
      summaryParts.push(`SPY shows bullish momentum with ${bullishCount} of 5 indicators signaling upside.`);
    } else if (prediction === "bearish") {
      summaryParts.push(`SPY shows bearish pressure with ${bearishCount} of 5 indicators signaling downside.`);
    } else {
      summaryParts.push("SPY is in a mixed/consolidation phase with conflicting signals across indicators.");
    }
    if (rsi < 35) summaryParts.push("RSI is oversold, suggesting a potential bounce.");
    if (rsi > 65) summaryParts.push("RSI is overbought, indicating possible pullback pressure.");
    if (macd.histogram > 0) summaryParts.push("MACD histogram is positive, supporting upward momentum.");
    if (macd.histogram < 0) summaryParts.push("MACD histogram is negative, reflecting weakening momentum.");
    if (sma50 > sma200) summaryParts.push("Golden cross in effect (50 SMA above 200 SMA), long-term trend is bullish.");
    else summaryParts.push("Death cross in effect (50 SMA below 200 SMA), long-term trend is bearish.");

    const indicators = [
      {
        name: "RSI (14)",
        value: Math.round(rsi * 100) / 100,
        signal: rsiSignal,
        description: `RSI at ${rsi.toFixed(1)} — ${rsi < 35 ? "Oversold zone, potential reversal upward" : rsi > 65 ? "Overbought zone, potential pullback" : "Neutral zone"}`,
      },
      {
        name: "SMA Crossover",
        value: Math.round((currentPrice / sma20 - 1) * 10000) / 100,
        signal: smaSignal,
        description: `Price is ${currentPrice > sma20 ? "above" : "below"} SMA20 ($${sma20.toFixed(2)}). SMA20 is ${sma20 > sma50 ? "above" : "below"} SMA50 ($${sma50.toFixed(2)})`,
      },
      {
        name: "MACD",
        value: Math.round(macd.histogram * 100) / 100,
        signal: macdSignal,
        description: `MACD: ${macd.macd.toFixed(2)}, Signal: ${macd.signal.toFixed(2)}, Histogram: ${macd.histogram.toFixed(2)} — ${macd.histogram > 0 ? "Bullish crossover" : "Bearish crossover"}`,
      },
      {
        name: "Bollinger Bands",
        value: Math.round(bb.percentB * 10000) / 100,
        signal: bbSignal,
        description: `Price at ${(bb.percentB * 100).toFixed(1)}% of BB range. Upper: $${bb.upper.toFixed(2)}, Lower: $${bb.lower.toFixed(2)}`,
      },
      {
        name: "Golden/Death Cross",
        value: Math.round((sma50 / sma200 - 1) * 10000) / 100,
        signal: goldenCrossSignal,
        description: `SMA50 ($${sma50.toFixed(2)}) is ${sma50 > sma200 ? "above" : "below"} SMA200 ($${sma200.toFixed(2)}) — ${sma50 > sma200 ? "Golden Cross (bullish)" : "Death Cross (bearish)"}`,
      },
    ];

    const data = GetSpyPredictionResponse.parse({
      symbol: "SPY",
      timestamp: new Date().toISOString(),
      currentPrice,
      prediction,
      confidence: Math.round(confidence),
      summary: summaryParts.join(" "),
      indicators,
      priceTargets: {
        support: Math.round(support * 100) / 100,
        resistance: Math.round(resistance * 100) / 100,
        upside: Math.round(upside * 100) / 100,
        downside: Math.round(downside * 100) / 100,
      },
    });

    res.json(data);
  } catch (err) {
    console.error("Error computing SPY prediction:", err);
    res.status(500).json({ error: "Failed to compute prediction" });
  }
});

export default router;
