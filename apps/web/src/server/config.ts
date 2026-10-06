import { usesVerifiedTls } from "@incision/database";
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
  // Without verified TLS, pg would send the password in clear text or trust any certificate.
  .refine((env) => env.NODE_ENV !== "production" || env.DATABASE_URL === undefined || usesVerifiedTls(env.DATABASE_URL), {
    message: "DATABASE_URL must use verified TLS (sslmode=verify-full) in production",
    path: ["DATABASE_URL"],
  });

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
