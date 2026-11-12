import jwt from "jsonwebtoken";
import config from "../config/config.js";

function createToken(req, res) {
  if (config.nodeEnv === "production") {
    return res.status(403).json({
      success: false,
      message: "Token generation is disabled in production",
    });
  }

  const { adminKey } = req.body;

  if (!adminKey || adminKey !== config.adminApiKey) {
    return res.status(401).json({
      success: false,
      message: "Invalid admin key",
    });
  }

  const token = jwt.sign(
    { role: "ADMIN" },
    config.jwtSecret,
    { expiresIn: config.jwtExpiresIn }
  );

  return res.status(200).json({
    success: true,
    token,
    tokenType: "Bearer",
    expiresIn: config.jwtExpiresIn,
  });
}

export default createToken;