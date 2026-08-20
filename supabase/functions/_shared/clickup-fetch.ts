// supabase/functions/_shared/clickup-fetch.ts
//
// Wrapper de fetch() para a API do ClickUp com retry exponencial e
// tratamento de rate limit (429, respeitando Retry-After quando presente).
// Antes, qualquer erro transitório (5xx, timeout de rede) ou o rate limit
// documentado do ClickUp (~100 req/min — já causou timeout real, ver
// mcp-brain/tools.ts) falhava a sincronização de forma permanente na
// primeira tentativa, sem nenhuma segunda chance.

export async function clickupFetch(
  url: string,
  options: RequestInit = {},
  maxRetries = 3,
): Promise<Response> {
  let lastError: unknown;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const res = await fetch(url, options);

      if (res.status === 429 && attempt < maxRetries) {
        const retryAfterHeader = res.headers.get("Retry-After");
        const waitMs = retryAfterHeader
          ? parseInt(retryAfterHeader, 10) * 1000
          : (attempt + 1) * 2000;
        console.warn(`[clickupFetch] 429 (rate limit) — aguardando ${waitMs}ms (tentativa ${attempt + 1}/${maxRetries})`);
        await new Promise((r) => setTimeout(r, waitMs));
        continue;
      }

      if (res.status >= 500 && attempt < maxRetries) {
        const waitMs = 500 * Math.pow(2, attempt);
        console.warn(`[clickupFetch] HTTP ${res.status} — retry em ${waitMs}ms (tentativa ${attempt + 1}/${maxRetries})`);
        await new Promise((r) => setTimeout(r, waitMs));
        continue;
      }

      return res;
    } catch (err) {
      lastError = err;
      if (attempt < maxRetries) {
        const waitMs = 500 * Math.pow(2, attempt);
        console.warn(`[clickupFetch] exceção de rede — retry em ${waitMs}ms (tentativa ${attempt + 1}/${maxRetries}):`, err);
        await new Promise((r) => setTimeout(r, waitMs));
        continue;
      }
    }
  }

  throw lastError ?? new Error("clickupFetch: esgotou as tentativas sem sucesso");
}
