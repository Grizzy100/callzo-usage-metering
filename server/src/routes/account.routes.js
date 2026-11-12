import { Router } from "express";

import getAccounts from "../controllers/account.controller.js";
import getAccountUsage from "../controllers/usage.controller.js";

import authenticate from "../middleware/auth.middleware.js";
import asyncHandler from "../utils/asyncHandler.js";

const router = Router();

router.use(authenticate);

router.get("/", asyncHandler(getAccounts));
router.get("/:accountId/usage", asyncHandler(getAccountUsage));

export default router;