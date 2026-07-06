/**
 * Rate limiting do login: 5 tentativas por minuto, por combinação IP+email
 * (`10-AUTH.md`). Implementação em memória (janela deslizante via `Map`) —
 * adequada para dev/single-instance (Vercel Hobby roda a app numa única
 * região/instância por request, sem múltiplos processos concorrentes
 * disputando o mesmo contador). Se um dia rodar múltiplas instâncias, trocar
 * por tabela Postgres (`LoginAttempt`) ou Upstash/Redis — a interface
 * `checkRateLimit` não muda, só a implementação interna.
 */

const WINDOW_MS = 60_000;
const MAX_ATTEMPTS = 5;

const attemptsByKey = new Map<string, number[]>();

export function checkRateLimit(key: string): { allowed: boolean } {
  const now = Date.now();
  const windowStart = now - WINDOW_MS;

  const recentAttempts = (attemptsByKey.get(key) ?? []).filter(
    (timestamp) => timestamp > windowStart
  );

  if (recentAttempts.length >= MAX_ATTEMPTS) {
    attemptsByKey.set(key, recentAttempts);
    return { allowed: false };
  }

  recentAttempts.push(now);
  attemptsByKey.set(key, recentAttempts);
  return { allowed: true };
}

/** Extrai o IP do cliente a partir dos headers de proxy padrão. */
export function getClientIp(request: Request): string {
  const forwardedFor = request.headers.get("x-forwarded-for");
  if (forwardedFor) return forwardedFor.split(",")[0]!.trim();

  return request.headers.get("x-real-ip") ?? "unknown";
}
