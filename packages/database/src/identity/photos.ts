import { eq, sql } from "drizzle-orm";
import type { Database } from "../client";
import { profilePhotos } from "../schema/profile-photos";

/** A missing account fails the FK; updates replace only that account's already validated photo. */
export async function saveProfilePhoto(db: Database, input: { readonly accountId: string; readonly webp: Buffer }): Promise<boolean> {
  const rows = await db.insert(profilePhotos).values(input).onConflictDoUpdate({
    target: profilePhotos.accountId,
    set: { webp: input.webp, revision: sql`gen_random_uuid()`, updatedAt: sql`now()` },
  }).returning({ accountId: profilePhotos.accountId });
  return rows.length === 1;
}

/** Used by the authenticated account page without loading binary data into its React payload. */
export async function readProfilePhotoRevision(db: Database, accountId: string): Promise<string | undefined> {
  const [row] = await db.select({ revision: profilePhotos.revision }).from(profilePhotos).where(eq(profilePhotos.accountId, accountId));
  return row?.revision;
}

/** No public account-id route: the HTTP adapter supplies its own authenticated account id. */
export async function readProfilePhoto(db: Database, accountId: string): Promise<Buffer | undefined> {
  const [row] = await db.select({ webp: profilePhotos.webp }).from(profilePhotos).where(eq(profilePhotos.accountId, accountId));
  return row?.webp;
}
