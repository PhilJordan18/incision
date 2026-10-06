import { z } from "zod";

const serverEnvSchema = z
  .object({
    NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
    PORT: z.coerce.number().int().min(1).max(65_535).default(3000),
    APP_URL: z.url({ protocol: /^https?$/ }).optional(),
    DATABASE_URL: z.string().min(1).optional(),
  })
  .refine((env) => env.NODE_ENV !== "production" || env.APP_URL !== undefined, {
    message: "APP_URL is required in production",
    path: ["APP_URL"],
  })
  .refine((env) => env.NODE_ENV !== "production" || env.DATABASE_URL !== undefined, {
    message: "DATABASE_URL is required in production",
    path: ["DATABASE_URL"],
  })
  .refine((env) => env.NODE_ENV !== "production" || requiresVerifiedTls(env.DATABASE_URL), {
    message: "DATABASE_URL must set sslmode=verify-full (or require) in production",
    path: ["DATABASE_URL"],
  });

/** Without sslmode, pg connects in clear text and would send the password unencrypted. */
function requiresVerifiedTls(databaseUrl: string | undefined): boolean {
  if (databaseUrl === undefined) {
    return true;
  }
  try {
    const sslMode = new URL(databaseUrl).searchParams.get("sslmode");
    return sslMode === "verify-full" || sslMode === "require";
  } catch {
    return false;
  }
}

export type ServerEnv = {
  readonly isProduction: boolean;
  readonly port: number;
  /** Public origin of the site, e.g. `https://example.azurewebsites.net`. */
  readonly appOrigin: string;
  readonly databaseUrl: string | undefined;
};

/** Validates the environment at start-up. Error messages name variables, never their values. */
export function parseServerEnv(env: Record<string, string | undefined>): ServerEnv {
  const result = serverEnvSchema.safeParse(env);
  if (!result.success) {
    const problems = result.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`);
    throw new Error(`Invalid server environment: ${problems.join("; ")}`);
  }
  const { NODE_ENV, PORT, APP_URL, DATABASE_URL } = result.data;
  return {
    isProduction: NODE_ENV === "production",
    port: PORT,
    appOrigin: new URL(APP_URL ?? `http://localhost:${PORT}`).origin,
    databaseUrl: DATABASE_URL,
  };
}
