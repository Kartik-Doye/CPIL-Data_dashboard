import dotenv from 'dotenv';
import path from 'path';

// Load .env from Analytical Dashboard folder or process root
try {
  dotenv.config({ path: path.resolve(process.cwd(), 'Analytical Dashboard/.env') });
} catch {
  // Ignore if already loaded
}
dotenv.config();
dotenv.config({ path: path.resolve(process.cwd(), 'Manual Work', '.env') });

export const DB_HOST = process.env.DB_HOST || 'localhost';
export const DB_PORT = parseInt(process.env.DB_PORT || '5432', 10);
export const DB_NAME = process.env.DB_NAME || 'sale_alds';
export const DB_USER = process.env.DB_USER || 'bot_reader';
export const DB_PASSWORD = process.env.BOT_READER_PASSWORD || process.env.DB_PASSWORD || '';
export const DB_LOADER_USER = process.env.BOT_LOADER_USER || 'bot_loader';
export const DB_LOADER_PASSWORD = process.env.BOT_LOADER_PASSWORD || '';
export const FLASK_PORT = parseInt(process.env.FLASK_PORT || '5000', 10);
export const PORT = parseInt(process.env.PORT || '5000', 10);

// DB hardening (read-only, 15s statement timeout)
export const DB_CONNECT_TIMEOUT = parseInt(process.env.DB_CONNECT_TIMEOUT || '10', 10);
export const DB_STATEMENT_TIMEOUT_MS = parseInt(process.env.DB_STATEMENT_TIMEOUT_MS || '15000', 10);
