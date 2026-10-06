import { isLocalDatabase, usesVerifiedTls } from "@incision/database";
import { z } from "zod";

/** Variables without which production must not start (docs/DEPLOYMENT.md lists them). */
const REQUIRED_IN_PRODUCTION = [
  "APP_URL",
  "AUTH_URL",
  "AUTH_SECRET",
  "DATABASE_URL",
  "AUTH_GITHUB_ID",
  "AUTH_GITHUB_SECRET",
  "AUTH_DISCORD_ID",
  "AUTH_DISCORD_SECRET",
  "TRUSTED_PROXY_HOPS",
] as const;

const LOCAL_HOSTNAMES = new Set(["localhost", "127.0.0.1", "[::1]"]);

const nonEmpty = z.string().min(1, "must not be empty");

const serverEnvSchema = z
  .object({
    NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
    PORT: z.coerce.number().int().min(1).max(65_535).default(3000),
    APP_URL: z.url({ protocol: /^https?$/ }).optional(),
    /** Auth.js public URL; the library reads it itself, we check it matches APP_URL. */
    AUTH_URL: z.url({ protocol: /^https?$/ }).optional(),
    /** Encrypts the session JWT; `openssl rand -base64 32` gives 44 characters. */
    AUTH_SECRET: z.string().min(32, "must have at least 32 characters").optional(),
    DATABASE_URL: nonEmpty.optional(),
    AUTH_GITHUB_ID: nonEmpty.optional(),
    AUTH_GITHUB_SECRET: nonEmpty.optional(),
    AUTH_DISCORD_ID: nonEmpty.optional(),
    AUTH_DISCORD_SECRET: nonEmpty.optional(),
    /** Reverse proxies in front of the app whose X-Forwarded-For entry is trusted: 1 on App Service. */
    TRUSTED_PROXY_HOPS: z.coerce.number().int().min(0).max(2).optional(),
  })
  .superRefine((env, context) => {
    const problem = (path: string, message: string) => context.addIssue({ code: "custom", path: [path], message });
    // Refinements also run when a field failed its own check: parse URLs defensively.
    const appOrigin = env.APP_URL === undefined ? `http://localhost:${env.PORT}` : URL.parse(env.APP_URL)?.origin;
    if (env.AUTH_URL !== undefined && appOrigin !== undefined && !isPublicRoot(env.AUTH_URL, appOrigin)) {
      problem("AUTH_URL", "must equal APP_URL (same origin, no path)");
    }
    if (env.NODE_ENV !== "production") {
      return;
    }
    for (const name of REQUIRED_IN_PRODUCTION) {
      if (env[name] === undefined) {
        problem(name, "is required in production");
      }
    }
    // Secure cookies need HTTPS; a localhost URL is allowed for local production builds (E2E).
    if (env.APP_URL !== undefined && !isHttpsOrLocal(env.APP_URL)) {
      problem("APP_URL", "must use HTTPS in production");
    }
    // Without verified TLS, pg would send the password in clear text or trust any certificate.
    if (env.DATABASE_URL !== undefined && !isLocalDatabase(env.DATABASE_URL) && !usesVerifiedTls(env.DATABASE_URL)) {
      problem("DATABASE_URL", "must use verified TLS (sslmode=verify-full) in production");
    }
  });

export type ServerEnv = {
  readonly isProduction: boolean;
  readonly port: number;
  /** Public origin of the site, e.g. `https://example.azurewebsites.net`. */
  readonly appOrigin: string;
  readonly databaseUrl: string | undefined;
  /** AUTH_SECRET; undefined only outside production, where sign-in then fails closed. */
  readonly authSecret: string | undefined;
  /** HTTPS public URL: Auth.js then names its cookies `__Secure-…` (also the JWT key salt). */
  readonly secureCookies: boolean;
  readonly trustedProxyHops: number;
};

/** Validates the environment at start-up. Error messages name variables, never their values. */
export function parseServerEnv(env: Record<string, string | undefined>): ServerEnv {
  const result = serverEnvSchema.safeParse(env);
  if (!result.success) {
    const problems = result.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`);
    throw new Error(`Invalid server environment: ${problems.join("; ")}`);
  }
  const { NODE_ENV, PORT, APP_URL, DATABASE_URL, AUTH_SECRET, TRUSTED_PROXY_HOPS } = result.data;
  const appOrigin = new URL(APP_URL ?? `http://localhost:${PORT}`).origin;
  return {
    isProduction: NODE_ENV === "production",
    port: PORT,
    appOrigin,
    databaseUrl: DATABASE_URL,
    authSecret: AUTH_SECRET,
    secureCookies: appOrigin.startsWith("https:"),
    trustedProxyHops: TRUSTED_PROXY_HOPS ?? 0,
  };
}

function isPublicRoot(authUrl: string, appOrigin: string): boolean {
  const url = URL.parse(authUrl);
  return url !== null && url.origin === appOrigin && url.pathname === "/" && url.search === "" && url.hash === "";
}

function isHttpsOrLocal(appUrl: string): boolean {
  const url = URL.parse(appUrl);
  return url === null || url.protocol === "https:" || LOCAL_HOSTNAMES.has(url.hostname);
}
