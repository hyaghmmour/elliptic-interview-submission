/**
 * Shared HTTP helper for all integrations.
 * fetch() gotchas handled here (see resources/06-implementation-resources.md):
 *  - no default timeout → AbortSignal.timeout on every request
 *  - non-2xx does not reject → explicit res.ok check
 *  - some public explorers 403 the default user agent
 *  - error bodies may be plain text (Esplora), so read as text, never assume JSON
 */

const TIMEOUT_MS = 10_000;

const HEADERS = {
  "user-agent": "wallet-screener/0.1 (interview exercise)",
  accept: "application/json",
};

export async function getJson<T>(url: string): Promise<T> {
  return request<T>(url, { headers: HEADERS });
}

/** JSON-RPC style POST (used by the Solana client). */
export async function postJson<T>(url: string, body: unknown): Promise<T> {
  return request<T>(url, {
    method: "POST",
    headers: { ...HEADERS, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function request<T>(url: string, init: RequestInit): Promise<T> {
  // Error messages are user-visible (stderr warnings) — never leak the API key.
  const safeUrl = redactSecrets(url);
  const method = init.method ?? "GET";
  let res: Response;
  try {
    res = await fetch(url, { ...init, signal: AbortSignal.timeout(TIMEOUT_MS) });
  } catch (err) {
    if (err instanceof DOMException && err.name === "TimeoutError") {
      throw new Error(`${method} ${safeUrl} timed out after ${TIMEOUT_MS / 1000}s`);
    }
    throw new Error(`${method} ${safeUrl} failed: ${errorMessage(err)}`);
  }
  if (!res.ok) {
    const body = (await res.text()).slice(0, 200);
    throw new Error(`${method} ${safeUrl} → HTTP ${res.status}${body ? `: ${redactSecrets(body)}` : ""}`);
  }
  return (await res.json()) as T;
}

/** Mask API-key query params wherever a URL (or echoed URL) ends up in output. */
export function redactSecrets(text: string): string {
  return text.replace(/(apikey=)[^&\s"']+/gi, "$1***");
}

export function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
