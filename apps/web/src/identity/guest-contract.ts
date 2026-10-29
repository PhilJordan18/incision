import { parseGuestNickname } from "@incision/domain";
import { z } from "zod";

/** Body bound precedes JSON parsing; this bound additionally limits normalisation work. */
export const guestStartSchema = z.object({ nickname: z.string().max(256) }).strict()
  .transform(({ nickname }, context) => {
    const result = parseGuestNickname(nickname);
    if (!result.ok) {
      context.addIssue({ code: "custom", message: "INVALID_GUEST_NICKNAME" });
      return z.NEVER;
    }
    return { nickname: result.value };
  });
export const guestRenewSchema = z.object({}).strict();
