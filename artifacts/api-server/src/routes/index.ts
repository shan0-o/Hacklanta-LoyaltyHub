import { Router, type IRouter } from "express";
import healthRouter from "./health";
import loyaltyRouter from "./loyalty";

const router: IRouter = Router();

router.use(healthRouter);
router.use(loyaltyRouter);

export default router;
