/** Verified server identity. Never accepted from a public request or used as a room projection. */
export type HumanSubject =
  | { readonly kind: "account"; readonly accountId: string }
  | { readonly kind: "guest"; readonly guestSessionId: string };

/** Prevents an account and a guest with the same UUID sharing a rate/presence budget. */
export function humanSubjectKey(subject: HumanSubject): string {
  return subject.kind === "account" ? `account:${subject.accountId}` : `guest:${subject.guestSessionId}`;
}
