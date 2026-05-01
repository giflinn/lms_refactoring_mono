import {
  pgTable,
  pgEnum,
  uuid,
  text,
  timestamp,
  integer,
  index,
  AnyPgColumn,
} from "drizzle-orm/pg-core";

export const userRoleEnum = pgEnum("user_role", [
  "client",
  "manager",
  "senior_manager",
  "admin",
]);

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  firebaseUid: text("firebase_uid").notNull().unique(),
  email: text("email").notNull(),
  role: userRoleEnum("role").notNull().default("client"),
  firstName: text("first_name").notNull().default(""),
  lastName: text("last_name").notNull().default(""),
  phone: text("phone"),
  // 6-digit numeric code, present on managers/senior_managers/admins; clients enter
  // it during registration to be linked to their manager.
  managerCode: text("manager_code").unique(),
  // FK to the manager assigned to this client. Self-referential — column type
  // depends on the table itself, so we use the AnyPgColumn helper.
  managerId: uuid("manager_id").references((): AnyPgColumn => users.id),
  avatarUrl: text("avatar_url"),
  // Free-form note shown in the staff list (Figma "Комментарий" column).
  // Only meaningful for staff rows; clients leave it null.
  comment: text("comment"),
  // Soft-delete marker for staff. When non-null the user is hidden from the
  // managers list, the resolveManagerId fallback, and is `disabled` in Firebase.
  deactivatedAt: timestamp("deactivated_at", { withTimezone: true }),
  // Audit timestamp for legal/compliance: when user accepted the offer + privacy
  // policy. Nullable so existing seeded admins (who never saw the form) stay null.
  termsAcceptedAt: timestamp("terms_accepted_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// Custom OTP table for the in-app password reset flow (Firebase only supports
// magic-link reset; we implement OTP per design).
export const passwordResetCodes = pgTable(
  "password_reset_codes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    email: text("email").notNull(),
    // SHA-256(code + email) — never store the plaintext OTP.
    codeHash: text("code_hash").notNull(),
    // Issued only after a successful /verify call; passed back to /complete.
    resetToken: text("reset_token").unique(),
    resetTokenExpiresAt: timestamp("reset_token_expires_at", {
      withTimezone: true,
    }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    attempts: integer("attempts").notNull().default(0),
    consumedAt: timestamp("consumed_at", { withTimezone: true }),
    ipAddress: text("ip_address"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("password_reset_codes_email_idx").on(t.email)],
);
