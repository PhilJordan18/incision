/**
 * Browsers always send `Origin` on a WebSocket handshake, and the handshake is not
 * protected by CORS. Accepting only our own origin stops another site from opening
 * a socket with a visitor's cookies (cross-site WebSocket hijacking).
 */
export function isAllowedOrigin(origin: string | undefined, allowedOrigin: string): boolean {
  if (origin === undefined) {
    return false;
  }
  try {
    return new URL(origin).origin === allowedOrigin;
  } catch {
    return false;
  }
}
