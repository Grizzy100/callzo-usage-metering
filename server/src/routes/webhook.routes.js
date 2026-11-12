
import express, { Router } from "express";

import receiveWebhook from "../controllers/webhook.controller.js";
import verifySignature from "../middleware/signature.middleware.js";
import asyncHandler from "../utils/asyncHandler.js";

const router = Router();

router.post(
  "/calls",
  express.raw({
    type: "application/json",
    limit: "1mb",
  }),
  verifySignature,
  asyncHandler(receiveWebhook)
);

export default router;
