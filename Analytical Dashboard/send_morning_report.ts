import { APP_BASE_URL, EMAIL_API_TIMEOUT_MS } from './src/engine/config.js';

async function sendMorningReport() {
  const endpoint = new URL('/api/email/send', APP_BASE_URL);
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'X-GO-Gas-Email-Request': 'authorized-client',
    },
    signal: AbortSignal.timeout(EMAIL_API_TIMEOUT_MS),
  });
  const contentType = response.headers.get('content-type') || '';
  const responseText = await response.text();
  const payload = contentType.includes('application/json')
    ? (JSON.parse(responseText) as { message?: string; error?: string })
    : null;

  if (!response.ok) {
    throw new Error(payload?.error || `Dashboard email endpoint returned HTTP ${response.status}.`);
  }
  if (!payload?.message) {
    throw new Error('Dashboard email endpoint returned an invalid response.');
  }

  console.log(payload.message);
}

sendMorningReport().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[MORNING EMAIL] ${message}`);
  process.exitCode = 1;
});
