import { sql } from "drizzle-orm";
import { check, pgEnum, pgTable, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";

export const oauthProvider = pgEnum("oauth_provider", ["github", "discord"]);

/**
 * Application identity (AUTH-01). Its UUID is the identity used everywhere else, distinct
 * from any provider id. No email column: the project keeps no email address.
 */
export const accounts = pgTable(
  "accounts",
  {
    id: uuid().primaryKey().defaultRandom(),
    login: text(),
    loginCanonical: text("login_canonical"),
    displayName: text("display_name").notNull(),
    passwordHash: text("password_hash"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    unique("accounts_login_canonical_unique").on(table.loginCanonical),
    check("accounts_login_pair", sql`(${table.login} is null) = (${table.loginCanonical} is null)`),
    // Same rule as parseLogin in @incision/domain: ASCII, so lower() is deterministic.
    check(
      "accounts_login_format",
      sql`${table.login} ~ '^[A-Za-z0-9_-]{3,32}$' and ${table.loginCanonical} = lower(${table.login})`,
    ),
    check("accounts_password_requires_login", sql`${table.passwordHash} is null or ${table.loginCanonical} is not null`),
    check("accounts_password_hash_not_empty", sql`${table.passwordHash} is null or ${table.passwordHash} <> ''`),
    check(
      "accounts_display_name_length",
      sql`char_length(${table.displayName}) between 1 and 40 and btrim(${table.displayName}) <> ''`,
    ),
  ],
);

/** Provider identities mapped to an account. Provider tokens are not stored. */
export const oauthIdentities = pgTable(
  "oauth_identities",
  {
    id: uuid().primaryKey().defaultRandom(),
    accountId: uuid("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    provider: oauthProvider().notNull(),
    providerSubject: text("provider_subject").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique("oauth_identities_provider_subject_unique").on(table.provider, table.providerSubject),
    unique("oauth_identities_account_provider_unique").on(table.accountId, table.provider),
    check("oauth_identities_subject_not_empty", sql`char_length(${table.providerSubject}) > 0`),
  ],
);
