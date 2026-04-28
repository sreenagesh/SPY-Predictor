import { Router, type IRouter } from "express";
import healthRouter from "./health";
import spyRouter from "./spy";
import optionsRouter from "./options";
import tradingRouter from "./trading";
import bestOptionsRouter from "./best-options";
import gexRouter from "./gex";

const router: IRouter = Router();

router.use(healthRouter);
router.use(spyRouter);
router.use(optionsRouter);
router.use(tradingRouter);
router.use(bestOptionsRouter);
router.use(gexRouter);

export default router;
