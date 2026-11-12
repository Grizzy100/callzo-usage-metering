import "dotenv/config";

function getRequiredEnv(name) {
  const value = process.env[name];

  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

const config = {
  nodeEnv: process.env.NODE_ENV || "development",
  port: Number(process.env.PORT) || 3000,

  databaseUrl: getRequiredEnv("DATABASE_URL"),
  webhookSecret: getRequiredEnv("WEBHOOK_SECRET"),

  jwtSecret: getRequiredEnv("JWT_SECRET"),
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || "1d",

  adminApiKey: getRequiredEnv("ADMIN_API_KEY"),
};

export default config;