export type Handshake = {
  readonly origin: string | undefined;
  readonly secFetchSite: string | undefined;
  /** Engine.io JSONP polling (`j` query parameter); the v4 client never uses it. */
  readonly isJsonp: boolean;
};

/**
 * Refuses Socket.IO handshakes initiated by another site (cross-site WebSocket hijacking:
 * the handshake is not protected by CORS and carries the visitor's cookies).
 *
 * Browsers send `Origin` on every WebSocket handshake and cross-origin request, but not
 * on a same-origin GET such as Socket.IO's first polling request. A missing `Origin` is
 * therefore accepted unless Fetch Metadata says the request is cross-site; non-browser
 * clients cannot reuse a visitor's cookies anyway. JSONP is refused: a cross-site
 * <script> could read its response, and with it the session id, without any Origin.
 */
export function isAllowedHandshake({ origin, secFetchSite, isJsonp }: Handshake, allowedOrigin: string): boolean {
  if (isJsonp || secFetchSite?.toLowerCase() === "cross-site") {
    return false;
  }
  if (origin === undefined) {
    return true;
  }
  try {
    return new URL(origin).origin === allowedOrigin;
  } catch {
    return false;
  }
}
