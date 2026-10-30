/** Closed by default until the complete guest journey has passed its activation gates. */
export function guestEntryEnabled(): boolean { return process.env.GUEST_ENTRY_ENABLED === "true"; }
