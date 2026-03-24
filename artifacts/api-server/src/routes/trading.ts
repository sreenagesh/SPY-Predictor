import { Router, type IRouter } from "express";
import { GetIntradaySignalResponse, GetSwingSignalResponse, GetMtfAnalysisResponse } from "@workspace/api-zod";
import { computeIntradaySignal } from "../lib/intraday-signal.js";
import { computeSwingSignal } from "../lib/swing-signal.js";
import { computeMtfAnalysis } from "../lib/mtf-analysis.js";

const router: IRouter = Router();

router.get("/trading/intraday", async (_req, res): Promise<void> => {
  try {
    const signal = await computeIntradaySignal();
    const data = GetIntradaySignalResponse.parse(signal);
    res.json(data);
  } catch (err) {
    console.error("Error computing intraday signal:", err);
    res.status(500).json({ error: "Failed to compute intraday signal" });
  }
});

router.get("/trading/swing", async (_req, res): Promise<void> => {
  try {
    const signal = await computeSwingSignal();
    const data = GetSwingSignalResponse.parse(signal);
    res.json(data);
  } catch (err) {
    console.error("Error computing swing signal:", err);
    res.status(500).json({ error: "Failed to compute swing signal" });
  }
});

router.get("/trading/mtf", async (_req, res): Promise<void> => {
  try {
    const analysis = await computeMtfAnalysis();
    const data = GetMtfAnalysisResponse.parse(analysis);
    res.json(data);
  } catch (err) {
    console.error("Error computing MTF analysis:", err);
    res.status(500).json({ error: "Failed to compute multi-timeframe analysis" });
  }
});

export default router;
