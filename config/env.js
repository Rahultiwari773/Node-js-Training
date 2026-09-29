const dotenv = require('dotenv');

dotenv.config();

const requiredEnvironmentVariables = ['MONGO_URI', 'JWT_SECRET'];
const configuredOrigins = (process.env.CORS_ORIGINS || 'http://localhost:5000,http://localhost:5173')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

for (const variableName of requiredEnvironmentVariables) {
  if (!process.env[variableName]) {
    throw new Error(`Missing required environment variable: ${variableName}`);
  }
}

module.exports = {
  port: Number(process.env.PORT) || 5000,
  mongoUri: process.env.MONGO_URI,
  jwtSecret: process.env.JWT_SECRET,
  accessTokenMinutes: Math.max(1, Number(process.env.ACCESS_TOKEN_MINUTES) || 15),
  refreshTokenDays: Math.max(1, Number(process.env.REFRESH_TOKEN_DAYS) || 30),
  appUrl: process.env.APP_URL || 'http://localhost:5000',
  allowedOrigins: process.env.NODE_ENV === 'production'
    ? configuredOrigins
    : [...new Set([...configuredOrigins, 'http://localhost:5173', 'http://localhost:5174'])],
  verificationTokenMinutes: Number(process.env.VERIFICATION_TOKEN_MINUTES) || 30,
  resetTokenMinutes: Number(process.env.RESET_TOKEN_MINUTES) || 15,
  emailConfig: {
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT) || 587,
    secure: process.env.SMTP_SECURE === 'true',
    user: process.env.SMTP_USER,
    password: process.env.SMTP_PASSWORD,
    from: process.env.EMAIL_FROM || process.env.SMTP_USER
  }
};
