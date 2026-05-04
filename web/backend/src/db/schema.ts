import {
  pgTable,
  pgEnum,
  pgSequence,
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
  // Updated at last socket disconnect to drive the "был(а) в сети N минут
  // назад" presence label. While a socket is open the user is considered
  // online via the in-memory presence registry; this column is the durable
  // fallback after disconnect.
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true }),
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
    // How many days the order stays 'active' after first_paid_at. Only
    // meaningful for non-bookable, non-perpetual products (courses,
    // training cohorts, time-limited materials). NULL = bookable
    // (lifecycle handled by bookedEnd) or perpetual (book/file — order
    // stays 'active' forever and is never auto-completed).
    activeDurationDays: integer("active_duration_days"),
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

// One chat thread per client — the conversation between the client and
// whichever staff member happens to be assigned at the moment. Manager
// reassignment keeps the same thread; new manager inherits the history.
// Senior managers and admins can read/write any thread without being on the
// participants list (no participants table — authorization is derived from
// users.role + users.manager_id).
//
// last_message_at + last_message_preview are denormalized so the chat list
// can be rendered with a single query. They're updated transactionally
// alongside chat_messages inserts.
export const chatThreads = pgTable(
  "chat_threads",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    clientId: uuid("client_id")
      .notNull()
      .unique()
      .references(() => users.id, { onDelete: "cascade" }),
    lastMessageAt: timestamp("last_message_at", { withTimezone: true }),
    lastMessagePreview: text("last_message_preview"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("chat_threads_last_message_at_idx").on(t.lastMessageAt)],
);

export const chatMessageKindEnum = pgEnum("chat_message_kind", [
  "text",
  "system",
]);

// Individual messages. body may be NULL when the message only carries
// attachments (e.g. a single image with no caption). attachments stores an
// array of { url, mime, name, size } objects — small jsonb is fine; we don't
// need to query individual attachments. kind='system' is used for events like
// "Старший менеджер X присоединился к чату" — sender_id then points to the
// staff user who triggered the event.
export const chatMessages = pgTable(
  "chat_messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    threadId: uuid("thread_id")
      .notNull()
      .references(() => chatThreads.id, { onDelete: "cascade" }),
    senderId: uuid("sender_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    body: text("body"),
    attachments: text("attachments"), // JSON-encoded array (jsonb would work too;
    // text keeps the migration tiny and we never filter by attachment content)
    kind: chatMessageKindEnum("kind").notNull().default("text"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("chat_messages_thread_id_created_at_idx").on(
      t.threadId,
      t.createdAt,
    ),
  ],
);

// Per-user read state. Composite PK keeps it idempotent. Works uniformly for
// clients (their thread), assigned managers, and senior_managers / admins
// who joined later — anyone with read access has a row here once they open
// the thread. Unread count for user X on thread T = COUNT(messages where
// thread_id=T AND created_at > chat_reads.last_read_at AND sender_id != X).
export const chatReads = pgTable(
  "chat_reads",
  {
    threadId: uuid("thread_id")
      .notNull()
      .references(() => chatThreads.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    lastReadAt: timestamp("last_read_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.threadId, t.userId] }),
    index("chat_reads_user_id_idx").on(t.userId),
  ],
);

export const fcmPlatformEnum = pgEnum("fcm_platform", ["ios", "android"]);

// One row per (user, device). The same user installed on phone + tablet has
// two rows. Tokens rotate periodically — when FCM hands the mobile app a new
// token we upsert by (token); a token can also migrate users (sign-out +
// sign-in on the same device), so user_id is updated on conflict.
export const userFcmTokens = pgTable(
  "user_fcm_tokens",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    token: text("token").notNull().unique(),
    platform: fcmPlatformEnum("platform").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("user_fcm_tokens_user_id_idx").on(t.userId)],
);

export const notificationStatusEnum = pgEnum("notification_status", [
  "active",
  "completed",
  "cancelled",
]);

export const notificationRecurrenceUnitEnum = pgEnum(
  "notification_recurrence_unit",
  ["week", "month", "year"],
);

// Scheduled push notifications composed by admins/senior managers for
// targeted client categories. One-shot rows have scheduled_at set and the
// recurrence_* columns null. Recurring rows have starts_at + recurrence_*
// set (and optionally ends_at). next_fire_at is the dispatcher's cursor —
// it equals scheduled_at for one-shots and gets recomputed after each
// successful send for recurring rows. Status flips to 'completed' once the
// one-shot has fired or the recurring schedule has passed ends_at.
export const notifications = pgTable(
  "notifications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    title: text("title").notNull(),
    body: text("body").notNull(),
    // NULL targets all clients; otherwise filters by users.client_category.
    category: clientCategoryEnum("category"),
    scheduledAt: timestamp("scheduled_at", { withTimezone: true }),
    recurrenceUnit: notificationRecurrenceUnitEnum("recurrence_unit"),
    // Every N units (e.g. 1 = every week, 2 = every other week).
    recurrenceInterval: integer("recurrence_interval"),
    // ISO weekday names ('mon','tue',...). Only meaningful when unit='week'.
    recurrenceByweekday: text("recurrence_byweekday").array(),
    startsAt: timestamp("starts_at", { withTimezone: true }),
    endsAt: timestamp("ends_at", { withTimezone: true }),
    nextFireAt: timestamp("next_fire_at", { withTimezone: true }),
    status: notificationStatusEnum("status").notNull().default("active"),
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
  (t) => [index("notifications_next_fire_at_idx").on(t.nextFireAt)],
);

// Per-recipient delivery audit. One row per (notification, user, fire). For
// recurring notifications the same notification_id+user_id pair can appear
// multiple times — once per fire — distinguished by sent_at. The mobile
// inbox UI (deferred) will read this table.
export const notificationDeliveries = pgTable(
  "notification_deliveries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    notificationId: uuid("notification_id")
      .notNull()
      .references(() => notifications.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    sentAt: timestamp("sent_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    readAt: timestamp("read_at", { withTimezone: true }),
  },
  (t) => [
    index("notification_deliveries_user_id_idx").on(t.userId),
    index("notification_deliveries_notification_id_idx").on(t.notificationId),
  ],
);

// Where the money is at. 'new' = order created, awaiting client receipt.
// 'paid' = manager confirmed Kaspi screenshot. 'unpaid' = manager rejected
// or 24h auto-flip. 'refunded' = paid then walked back. Cancellation as
// a concept lives on fulfillment_status, not here.
export const paymentStatusEnum = pgEnum("payment_status", [
  "new",
  "paid",
  "unpaid",
  "refunded",
]);

// Where the order is in its lifecycle. 'active' = client still has access /
// the booking is in the future. 'completed' = the time-window expired (cron
// flips this) or the meeting passed. 'cancelled' = staff voided the order
// regardless of payment state.
export const fulfillmentStatusEnum = pgEnum("fulfillment_status", [
  "active",
  "completed",
  "cancelled",
]);

// Human-friendly 7+ digit order number shown in the UI ("№1210920"). Internal
// references still use uuid id; this column is for staff and clients who need
// to read or quote a number out loud. Starts at 1_000_000 so even the very
// first order looks like a real one.
export const ordersNumberSeq = pgSequence("orders_number_seq", {
  startWith: 1000000,
});

// One purchase. Created in a transaction by POST /orders right before the
// mobile app hands the user off to Kaspi. Snapshot semantics live on
// order_items (title/category/price frozen at create-time); this table holds
// the order-level metadata only. status defaults to 'new' and flips manually
// from the admin drawer (or via the daily new→unpaid sweep).
//
// manager_id is also a snapshot — copied from users.manager_id at create
// time. Reassigning a client to a different manager later does NOT migrate
// historical orders. Nullable because clients without an assigned manager
// (edge case during the seed-admin-only window) still need to be able to
// place orders.
export const orders = pgTable(
  "orders",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orderNumber: integer("order_number")
      .notNull()
      .unique()
      .default(sql`nextval('orders_number_seq')`),
    clientId: uuid("client_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    managerId: uuid("manager_id").references(() => users.id, {
      onDelete: "set null",
    }),
    paymentStatus: paymentStatusEnum("payment_status")
      .notNull()
      .default("new"),
    fulfillmentStatus: fulfillmentStatusEnum("fulfillment_status")
      .notNull()
      .default("active"),
    // Tenge with two decimal places to match products.price; populated server-
    // side from the snapshot row prices, never trusted from the client.
    totalTenge: numeric("total_tenge", { precision: 12, scale: 2 }).notNull(),
    // First time the order entered 'paid'. Drives expires_at calculation
    // for time-bound items and survives back-and-forth status flips (we
    // never reset it once set).
    firstPaidAt: timestamp("first_paid_at", { withTimezone: true }),
    statusChangedAt: timestamp("status_changed_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    statusChangedByUserId: uuid("status_changed_by_user_id").references(
      () => users.id,
      { onDelete: "set null" },
    ),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("orders_client_id_idx").on(t.clientId),
    index("orders_manager_id_idx").on(t.managerId),
    index("orders_payment_status_idx").on(t.paymentStatus),
    index("orders_fulfillment_status_idx").on(t.fulfillmentStatus),
    index("orders_created_at_idx").on(t.createdAt),
  ],
);

// One row per product in the order. product_id keeps a navigational link
// back to the catalog row, but the displayable fields (title, category name,
// subtitle, unit_price) are frozen at create-time. This protects the
// historical order from later product edits or deletion (the FK is RESTRICT,
// so deleting a product with order history is refused at the DB level).
//
// booked_start / booked_end are populated only for bookable products
// (products.duration_minutes != null). The matching row in coach_bookings
// holds the slot reservation; if a booking is cancelled the order_item still
// carries the original booked range for audit.
export const orderItems = pgTable(
  "order_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "restrict" }),
    productTitle: text("product_title").notNull(),
    productCategoryName: text("product_category_name").notNull(),
    productSubtitle: text("product_subtitle"),
    unitPriceTenge: numeric("unit_price_tenge", {
      precision: 12,
      scale: 2,
    }).notNull(),
    quantity: integer("quantity").notNull().default(1),
    bookedStart: timestamp("booked_start", { withTimezone: true }),
    bookedEnd: timestamp("booked_end", { withTimezone: true }),
    // When the item's lifecycle window ends. Set:
    //   - bookable products: bookedEnd at creation
    //   - time-bound non-bookable: first_paid_at + active_duration_days
    //     (computed by orderStatus when payment first transitions to 'paid')
    //   - perpetual products: NULL (never expires)
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("order_items_order_id_idx").on(t.orderId)],
);

// Append-only audit of every status transition. Created lazily — the
// initial 'new' on order creation is NOT logged (visible from orders.created_at).
// Logged for the cron auto-transition (changed_by_user_id is null then) and
// for every manual change from the admin drawer.
export const orderStatusLog = pgTable(
  "order_status_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    fromStatus: paymentStatusEnum("from_status").notNull(),
    toStatus: paymentStatusEnum("to_status").notNull(),
    // Null for the cron-driven new→unpaid sweep, populated for staff actions.
    changedByUserId: uuid("changed_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    changedAt: timestamp("changed_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("order_status_log_order_id_idx").on(t.orderId)],
);

// Sub-range reservation inside a coach_slot. Created together with an
// order_item in the same transaction at order creation time. The coach
// calendar reads these to render colored slices over the slot tile and to
// refuse new reservations on overlapping ranges.
//
// status reuses coach_slot_status_enum since the semantics are identical
// ('active' lives, 'cancelled' is dead). Reverting an order out of
// 'cancelled' tries to flip cancelled bookings back to active; if other
// bookings now overlap the range, the revert is refused with 409
// booking_conflict.
//
// order_item_id is nullable to keep the door open for future manual
// bookings without an order (free consultations etc.). For now every row
// has it set.
export const coachBookings = pgTable(
  "coach_bookings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    coachSlotId: uuid("coach_slot_id")
      .notNull()
      .references(() => coachSlots.id, { onDelete: "restrict" }),
    clientId: uuid("client_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    orderItemId: uuid("order_item_id").references(() => orderItems.id, {
      onDelete: "restrict",
    }),
    startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
    endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
    status: coachSlotStatusEnum("status").notNull().default("active"),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    check(
      "coach_bookings_ends_after_starts",
      sql`${t.endsAt} > ${t.startsAt}`,
    ),
    index("coach_bookings_slot_id_status_idx").on(t.coachSlotId, t.status),
    index("coach_bookings_client_id_idx").on(t.clientId),
    index("coach_bookings_order_item_id_idx").on(t.orderItemId),
  ],
);

// Generic key/value store for runtime-mutable settings edited from the admin
// panel. Starts with support_whatsapp + support_hours (shown to clients in
// the chat help dialog) and grows as more settings move out of constants.
// Single row per key; value is plain text — JSON encoding lives at the
// application layer when we need richer types.
export const appSettings = pgTable("app_settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedByUserId: uuid("updated_by_user_id").references(() => users.id, {
    onDelete: "set null",
  }),
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
