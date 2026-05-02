import {
  pgTable,
  pgEnum,
  uuid,
  text,
  timestamp,
  integer,
  index,
  uniqueIndex,
  check,
  date,
  numeric,
  boolean,
  primaryKey,
  AnyPgColumn,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const userRoleEnum = pgEnum("user_role", [
  "client",
  "manager",
  "senior_manager",
  "admin",
]);

// Manually assigned in the admin panel — not derived from purchase totals.
// Default 'new' so freshly registered clients show up correctly.
export const clientCategoryEnum = pgEnum("client_category", [
  "new",
  "regular",
  "vip",
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
  // Free-form note shown in the admin UI (staff list comment column for
  // managers, drawer field for clients).
  comment: text("comment"),
  // Client-only fields. Null on staff rows.
  birthDate: date("birth_date"),
  clientCategory: clientCategoryEnum("client_category").notNull().default("new"),
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

// Cover rendering mode for a product card. 'preset' is the default purple
// gradient with category badge + title + description + button overlay. With
// 'custom_bg' the same overlay is drawn over a user-uploaded background.
// 'custom_full' replaces the entire card with the user image — no overlay.
export const productCoverKindEnum = pgEnum("product_cover_kind", [
  "preset",
  "custom_bg",
  "custom_full",
]);

// Categories are folders for products. Mobile clients will group products by
// category in a future iteration; admin manages the list from a side drawer.
export const productCategories = pgTable("product_categories", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull().unique(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// Catalog item. Many fields will be added over time as the mobile app grows
// (video link, telegram link, dates, etc.) — they're intentionally omitted
// for now and added iteratively.
export const products = pgTable(
  "products",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    categoryId: uuid("category_id")
      .notNull()
      .references(() => productCategories.id, { onDelete: "restrict" }),
    title: text("title").notNull(),
    // Short caption shown under the title on the catalog card and in the
    // product list (e.g. "23-24 Марта", "1 день", "Хлопок 100%"). Optional —
    // products without a date or short hook just hide the line.
    subtitle: text("subtitle"),
    description: text("description").notNull(),
    buttonText: text("button_text").notNull(),
    // NULL = "по запросу"; otherwise tenge with up to 2 decimal places (column
    // is numeric to allow kopecks if a future product needs them, but the
    // admin form currently only takes whole tenge).
    price: numeric("price", { precision: 12, scale: 2 }),
    daysUntilCancel: integer("days_until_cancel").notNull(),
    // Bookable consultation length in minutes. NULL = ordinary product (no
    // calendar slot consumed). When non-NULL, at least one row in
    // product_slot_types must exist (enforced in the route layer).
    durationMinutes: integer("duration_minutes"),
    isPromo: boolean("is_promo").notNull().default(false),
    isActive: boolean("is_active").notNull().default(true),
    isTopSearch: boolean("is_top_search").notNull().default(false),
    coverKind: productCoverKindEnum("cover_kind").notNull().default("preset"),
    // Path under /product-images/<id>.<ext>; null for coverKind='preset'.
    coverImageUrl: text("cover_image_url"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("products_category_id_idx").on(t.categoryId)],
);

// Per-user catalog favorites. Composite PK keeps "one row per (user, product)"
// at the schema level, so POST /favorites is naturally idempotent via
// ON CONFLICT DO NOTHING. Both FKs cascade — when a user or product is
// deleted, their favorites disappear automatically.
export const productFavorites = pgTable(
  "product_favorites",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.productId] })],
);

// Slot types group coach availability by purpose (e.g. "Для денежной
// прокачки", "Утренние консультации"). A slot belongs to exactly one type;
// a product references one or many types via product_slot_types (added in a
// later phase) to declare which slots it can be booked against.
//
// Soft-deleted via archived_at so historical slots/bookings keep a valid
// reference. Name is unique only among non-archived rows — partial unique
// index lets staff delete a type and later create a new one with the same
// name.
export const slotTypes = pgTable(
  "slot_types",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    // Hex color used to differentiate types on the coach calendar grid.
    // Validated in the route layer against ^#[0-9A-Fa-f]{6}$.
    color: text("color").notNull(),
    sortOrder: integer("sort_order").notNull().default(0),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("slot_types_name_active_uniq")
      .on(t.name)
      .where(sql`${t.archivedAt} IS NULL`),
  ],
);

// M2M between products and slot types: declares which slot types a bookable
// product can consume. When the buyer picks a sub-range on mobile, only slots
// of these types qualify. Cascade on product delete; slot_types use
// soft-delete (archived_at) so 'restrict' here is a safety net that should
// never fire in practice.
export const productSlotTypes = pgTable(
  "product_slot_types",
  {
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    slotTypeId: uuid("slot_type_id")
      .notNull()
      .references(() => slotTypes.id, { onDelete: "restrict" }),
  },
  (t) => [
    primaryKey({ columns: [t.productId, t.slotTypeId] }),
    index("product_slot_types_slot_type_id_idx").on(t.slotTypeId),
  ],
);

export const coachSlotStatusEnum = pgEnum("coach_slot_status", [
  "active",
  "cancelled",
]);

// A block of coach availability tagged with a slot_type. Mobile bookings will
// later carve sub-ranges out of a slot — that's why a slot doesn't carry a
// duration, just a [starts_at, ends_at) range and a type. Status 'cancelled'
// is soft-delete; cancelled slots disappear from the calendar but stay in the
// table for audit and any historical bookings.
//
// Overlap prevention is enforced in the route layer (lt/gt query inside a
// transaction). Single coach + ~5 staff users means race conditions are
// vanishingly unlikely; if mobile bookings later create real concurrency,
// promote to a Postgres EXCLUDE constraint via a custom migration.
export const coachSlots = pgTable(
  "coach_slots",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    slotTypeId: uuid("slot_type_id")
      .notNull()
      .references(() => slotTypes.id, { onDelete: "restrict" }),
    startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
    endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
    status: coachSlotStatusEnum("status").notNull().default("active"),
    createdByUserId: uuid("created_by_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    check(
      "coach_slots_ends_after_starts",
      sql`${t.endsAt} > ${t.startsAt}`,
    ),
    index("coach_slots_starts_at_idx").on(t.startsAt),
    index("coach_slots_slot_type_id_idx").on(t.slotTypeId),
  ],
);

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
