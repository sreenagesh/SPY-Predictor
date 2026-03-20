import { Router, type IRouter } from "express";
import healthRouter from "./health";
import spyRouter from "./spy";
import optionsRouter from "./options";

const router: IRouter = Router();

router.use(healthRouter);
router.use(spyRouter);
router.use(optionsRouter);

export default router;
