/** Name of the violated unique constraint or index, looking through wrapped errors (Drizzle wraps pg's). */
export function uniqueViolationOf(error: unknown): string | undefined {
  let current: unknown = error;
  for (let depth = 0; depth < 5 && typeof current === "object" && current !== null; depth += 1) {
    if ("code" in current && current.code === "23505" && "constraint" in current && typeof current.constraint === "string") {
      return current.constraint;
    }
    current = "cause" in current ? current.cause : undefined;
  }
  return undefined;
}
