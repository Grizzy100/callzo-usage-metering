import crypto from "node:crypto";
import config from "../config/config.js";

function verifySignature(req, res, next) {
  const signature = req.get("X-Signature");

  if (!signature || !/^[a-fA-F0-9]{64}$/.test(signature)) {
    return res.status(401).json({
      success: false,
      message: "Missing or invalid signature",
    });
  }

  if (!Buffer.isBuffer(req.body)) {
    return res.status(400).json({
      success: false,
      message: "Invalid request body",
    });
  }

  const expectedSignature = crypto
    .createHmac("sha256", config.webhookSecret)
    .update(req.body)
    .digest();

  const receivedSignature = Buffer.from(signature, "hex");

  if (!crypto.timingSafeEqual(expectedSignature, receivedSignature)) {
    return res.status(401).json({
      success: false,
      message: "Invalid signature",
    });
  }

  next();
}

export default verifySignature;
