import { parseDisplayName } from "@incision/domain";
import { z } from "zod";

export type DisplayNameState = {
  readonly status: "idle" | "saved" | "invalid" | "unavailable";
  readonly value: string;
};

const submittedName = z.array(z.string().max(1024)).length(1);

/** Account id is supplied by the authenticated action, never by form fields or previous client state. */
export async function changeDisplayName(
  input: { readonly accountId: string; readonly form: FormData },
  update: (input: { readonly accountId: string; readonly displayName: string }) => Promise<{ readonly displayName: string } | undefined>,
): Promise<DisplayNameState> {
  const fields = submittedName.safeParse(input.form.getAll("displayName"));
  if (!fields.success) return { status: "invalid", value: "" };
  const raw = fields.data[0] ?? "";
  const parsed = parseDisplayName(raw);
  if (!parsed.ok) return { status: "invalid", value: raw };
  try {
    const result = await update({ accountId: input.accountId, displayName: parsed.value });
    return result === undefined
      ? { status: "unavailable", value: raw }
      : { status: "saved", value: result.displayName };
  } catch {
    // Neither database parameters nor submitted personal data belong in an error response or log.
    return { status: "unavailable", value: raw };
  }
}
