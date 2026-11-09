import dotenv from 'dotenv';

dotenv.config();

async function sendMorningReport() {
  const primaryPort = process.env.PORT || '3000';
  const candidatePorts = Array.from(new Set([primaryPort, '3000', '5000']));
  let lastError: Error | null = null;

  for (const port of candidatePorts) {
    try {
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
        ? (JSON.parse(responseText) as { message?: string; error?: string })
        : null;

      if (!response.ok) {
        throw new Error(payload?.error || `Dashboard email endpoint returned HTTP ${response.status}.`);
      }
      if (!payload?.message) {
        throw new Error('Dashboard email endpoint returned an invalid response.');
      }

      console.log(payload.message);
      return;
    } catch (error: unknown) {
      lastError = error instanceof Error ? error : new Error(String(error));
    }
  }

  throw lastError ?? new Error('Failed to connect to dashboard email endpoint.');
}

sendMorningReport().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[MORNING EMAIL] ${message}`);
  process.exitCode = 1;
});
