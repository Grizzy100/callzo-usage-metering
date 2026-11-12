
import logger from "../utils/logger.js";

function errorHandler(error, req, res, next) {
  logger.error("Request failed", {
    message: error.message,
    path: req.originalUrl,
    method: req.method,
    stack: error.stack,
  });

  if (res.headersSent) {
    return next(error);
  }

  const statusCode = error.statusCode || 500;

  res.status(statusCode).json({
    success: false,
    message:
      statusCode === 500
        ? "Internal server error"
        : error.message,
  });
}

export default errorHandler;
