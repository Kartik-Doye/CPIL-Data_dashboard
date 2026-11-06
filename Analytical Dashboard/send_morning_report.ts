import dotenv from 'dotenv';

dotenv.config();

async function sendMorningReport() {
  const port = process.env.PORT || '5000';
  const response = await fetch(`http://127.0.0.1:${port}/api/email/send`, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'X-GO-Gas-Email-Request': 'authorized-client',
    },
    signal: AbortSignal.timeout(30_000),
  });
  const contentType = response.headers.get('content-type') || '';
  const responseText = await response.text();
  const payload = contentType.includes('application/json')
    ? JSON.parse(responseText) as { message?: string; error?: string }
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
