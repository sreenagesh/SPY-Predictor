import { Router, type IRouter } from "express";
import { GetSpyOptionsResponse } from "@workspace/api-zod";
import { computeOptionsSignal } from "../lib/options-signal.js";

const router: IRouter = Router();

router.get("/spy/options", async (_req, res): Promise<void> => {
  try {
    const signal = await computeOptionsSignal();
    const data = GetSpyOptionsResponse.parse(signal);
    res.json(data);
  } catch (err) {
    console.error("Error computing options signal:", err);
    res.status(500).json({ error: "Failed to compute options signal" });
  }
});

export default router;
