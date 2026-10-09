/** Wrapped causes are followed this deep at most, so a cyclic `cause` cannot loop. */
export const MAX_CAUSE_DEPTH = 5;

/** A SQLSTATE: five characters, and no class starts with E, unlike Node's EPIPE or EPERM. */
const SQLSTATE = /^[0-9A-DF-Z][0-9A-Z]{4}$/;

/** The first error in the chain of causes that PostgreSQL raised (Drizzle wraps pg's). */
function postgresErrorOf(error: unknown): (object & { readonly code: string }) | undefined {
  let current: unknown = error;
  for (let depth = 0; depth < MAX_CAUSE_DEPTH && typeof current === "object" && current !== null; depth += 1) {
    if ("code" in current && typeof current.code === "string" && SQLSTATE.test(current.code)) {
      return current as object & { readonly code: string };
    }
    current = "cause" in current ? current.cause : undefined;
  }
  return undefined;
}

/** The SQLSTATE of a database error, looking through wrapped errors; undefined for a client-side failure. */
export function sqlStateOf(error: unknown): string | undefined {
  return postgresErrorOf(error)?.code;
}

/** Name of the violated unique constraint or index, looking through wrapped errors (Drizzle wraps pg's). */
export function uniqueViolationOf(error: unknown): string | undefined {
  const violation = postgresErrorOf(error);
  if (violation?.code === "23505" && "constraint" in violation && typeof violation.constraint === "string") {
    return violation.constraint;
  }
  return undefined;
}
