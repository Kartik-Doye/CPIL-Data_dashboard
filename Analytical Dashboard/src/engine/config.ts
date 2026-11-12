import fs from 'fs';
import dotenv from 'dotenv';
import path from 'path';
import productConfig from '../../../product-config.json';

function loadEnvFile(filePath: string) {
  if (!fs.existsSync(filePath)) return;
  const entries = dotenv.parse(fs.readFileSync(filePath));
  for (const [key, value] of Object.entries(entries)) {
    if (!process.env[key]?.trim() && value.trim()) process.env[key] = value;
  }
}

loadEnvFile(path.resolve(process.cwd(), 'Analytical Dashboard', '.env'));
loadEnvFile(path.resolve(process.cwd(), '.env'));
loadEnvFile(path.resolve(process.cwd(), 'Manual Work', '.env'));

export const PRODUCT_CONFIG = productConfig;
export const DB_HOST = process.env.DB_HOST || productConfig.database.host;
export const DB_PORT = parseInt(process.env.DB_PORT || String(productConfig.database.port), 10);
export const DB_NAME = process.env.DB_NAME || productConfig.database.name;
export const DB_USER = process.env.DB_USER || productConfig.database.readerUser;
export const DB_PASSWORD = process.env.BOT_READER_PASSWORD || process.env.DB_PASSWORD || '';
export const DB_LOADER_USER = process.env.BOT_LOADER_USER || productConfig.database.loaderUser;
export const DB_LOADER_PASSWORD = process.env.BOT_LOADER_PASSWORD || '';
export const FLASK_PORT = parseInt(process.env.FLASK_PORT || String(productConfig.application.flaskPort), 10);
export const PORT = parseInt(process.env.PORT || String(productConfig.application.port), 10);

export const DB_CONNECT_TIMEOUT = parseInt(
  process.env.DB_CONNECT_TIMEOUT || String(productConfig.database.connectTimeoutSeconds),
  10
);
export const DB_STATEMENT_TIMEOUT_MS = parseInt(
  process.env.DB_STATEMENT_TIMEOUT_MS || String(productConfig.database.statementTimeoutMs),
  10
);
export const DB_CONNECT_TIMEOUT_CEILING_MS = parseInt(
  process.env.DB_CONNECT_TIMEOUT_CEILING_MS || String(productConfig.database.connectTimeoutCeilingMs),
  10
);
export const DB_POOL_MAX = parseInt(process.env.DB_POOL_MAX || String(productConfig.database.maxConnections), 10);
export const DB_LOADER_POOL_MAX = parseInt(
  process.env.DB_LOADER_POOL_MAX || String(productConfig.database.loaderMaxConnections),
  10
);
export const DB_IDLE_TIMEOUT_MS = parseInt(
  process.env.DB_IDLE_TIMEOUT_MS || String(productConfig.database.idleTimeoutMs),
  10
);

export const SMTP_HOST = process.env.SMTP_HOST || productConfig.email.smtpHost;
export const SMTP_PORT = parseInt(process.env.SMTP_PORT || String(productConfig.email.smtpPort), 10);
const smtpSecureOverride = process.env.SMTP_SECURE?.trim();
export const SMTP_SECURE = smtpSecureOverride
  ? smtpSecureOverride.toLowerCase() === 'true'
  : productConfig.email.smtpSecure;
export const SMTP_USER = process.env.SMTP_USER || '';
export const SMTP_PASS = process.env.SMTP_PASS || '';
export const SMTP_TO = process.env.SMTP_TO || '';
export const SMTP_FROM_NAME = process.env.SMTP_FROM_NAME || productConfig.email.fromName;

export const APP_NAME = process.env.APP_NAME || productConfig.application.name;
const defaultBaseUrl = new URL(productConfig.application.baseUrl);
defaultBaseUrl.port = String(PORT);
export const APP_BASE_URL = process.env.APP_BASE_URL || defaultBaseUrl.origin;
export const APP_TIMEZONE = process.env.APP_TIMEZONE || productConfig.application.timezone;
export const APP_LOCAL_HOSTNAMES = productConfig.application.localHostnames;
export const APP_LOCAL_ADDRESS_PREFIXES = productConfig.application.localAddressPrefixes;
export const APP_TRUSTED_HOST_SUFFIXES = productConfig.application.trustedHostSuffixes;

const whatsappEnabledOverride = process.env.WHATSAPP_ENABLED?.trim();
export const WHATSAPP_ENABLED = whatsappEnabledOverride
  ? whatsappEnabledOverride.toLowerCase() === 'true'
  : productConfig.whatsapp.enabled;
export const WHATSAPP_RECIPIENT_NUMBERS = process.env.WHATSAPP_RECIPIENT_NUMBERS || '';
export const WHATSAPP_DAILY_MESSAGE = process.env.WHATSAPP_DAILY_MESSAGE || productConfig.whatsapp.dailyMessage;
export const WHATSAPP_WEB_VERSION = process.env.WHATSAPP_WEB_VERSION || productConfig.whatsapp.webVersion;
export const WHATSAPP_CHROME_EXECUTABLE_PATH =
  process.env.WHATSAPP_CHROME_EXECUTABLE_PATH || productConfig.whatsapp.chromeExecutablePath;
export const WHATSAPP_API_URL = process.env.WHATSAPP_API_URL || '';
export const WHATSAPP_API_TOKEN = process.env.WHATSAPP_API_TOKEN || '';
export const WHATSAPP_AUTH_DIRECTORY =
  process.env.WHATSAPP_AUTH_DIRECTORY || productConfig.whatsapp.authDirectory;
export const WHATSAPP_WEB_VERSION_CACHE_DIRECTORY =
  process.env.WHATSAPP_WEB_VERSION_CACHE_DIRECTORY || productConfig.whatsapp.webVersionCacheDirectory;
export const WHATSAPP_CRON_EXPRESSION = process.env.WHATSAPP_CRON_EXPRESSION || productConfig.whatsapp.cronExpression;
export const WHATSAPP_SCHEDULE_LABEL = process.env.WHATSAPP_SCHEDULE_LABEL || productConfig.whatsapp.scheduleLabel;
export const WHATSAPP_SEND_COOLDOWN_SECONDS = parseInt(
  process.env.WHATSAPP_SEND_COOLDOWN_SECONDS || String(productConfig.whatsapp.sendCooldownSeconds),
  10
);

export const EMAIL_CRON_EXPRESSION = process.env.EMAIL_CRON_EXPRESSION || productConfig.email.cronExpression;
export const EMAIL_SCHEDULE_LABEL = process.env.EMAIL_SCHEDULE_LABEL || productConfig.email.scheduleLabel;
export const EMAIL_SEND_COOLDOWN_SECONDS = parseInt(
  process.env.EMAIL_SEND_COOLDOWN_SECONDS || String(productConfig.email.sendCooldownSeconds),
  10
);
export const EMAIL_API_TIMEOUT_MS = parseInt(
  process.env.EMAIL_API_TIMEOUT_MS || String(productConfig.email.apiTimeoutMs),
  10
);
export const APP_REQUEST_BODY_LIMIT = process.env.APP_REQUEST_BODY_LIMIT || productConfig.application.requestBodyLimit;
export const TELEMETRY_CACHE_DURATION_MS = parseInt(
  process.env.TELEMETRY_CACHE_DURATION_MS || String(productConfig.telemetry.cacheDurationMs),
  10
);
export const TELEMETRY_HISTORY_WINDOW_DAYS = parseInt(
  process.env.TELEMETRY_HISTORY_WINDOW_DAYS || String(productConfig.telemetry.historyWindowDays),
  10
);
export const LEARNING_REFRESH_INTERVAL_MS = parseInt(
  process.env.LEARNING_REFRESH_INTERVAL_MS || String(productConfig.telemetry.learningRefreshIntervalMs),
  10
);

