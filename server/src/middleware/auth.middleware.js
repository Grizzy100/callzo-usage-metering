import jwt from "jsonwebtoken";
import config from "../config/config.js";

function authenticate(req, res, next) {
  const authorization = req.get("Authorization");

  if (!authorization?.startsWith("Bearer ")) {
    return res.status(401).json({
      success: false,
      message: "Authentication token is required",
    });
  }

  const token = authorization.slice(7);

  try {
    const decoded = jwt.verify(token, config.jwtSecret);

    if (decoded.role !== "ADMIN") {
      return res.status(403).json({
        success: false,
        message: "Insufficient permissions",
      });
    }

    req.user = decoded;
    next();
  } catch {
    return res.status(401).json({
      success: false,
      message: "Invalid or expired token",
    });
  }
}

export default authenticate;