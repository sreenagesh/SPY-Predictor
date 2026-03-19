import { Router, type IRouter } from "express";
import healthRouter from "./health";
import spyRouter from "./spy";

const router: IRouter = Router();

router.use(healthRouter);
router.use(spyRouter);

export default router;
