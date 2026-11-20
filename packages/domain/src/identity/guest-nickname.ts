import { parseDisplayName } from "./display-name";

export type GuestNicknameResult =
  | { readonly ok: true; readonly value: string }
  | { readonly ok: false; readonly error: "INVALID_GUEST_NICKNAME" };

/** D-04/D-14: the account's Unicode rules, with the guest's 3–20 code-point bounds. */
export function parseGuestNickname(input: string): GuestNicknameResult {
  const parsed = parseDisplayName(input);
  if (!parsed.ok || [...parsed.value].length < 3 || [...parsed.value].length > 20) {
    return { ok: false, error: "INVALID_GUEST_NICKNAME" };
  }
  return parsed;
}
