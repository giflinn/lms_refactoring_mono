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
  jsonb,
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
  // Soft-delete marker set when a client deletes their account from the mobile
  // app (DELETE /me). Distinct from deactivatedAt — Firebase user stays
  // enabled so the client can sign in again and tap "Restore". Backend gates
  // all data access by `selfDeletedAt IS NULL`. On set, PII (firstName,
  // lastName, phone, avatarUrl) is scrubbed and active telegram memberships
  // are kicked; email + firebaseUid are kept to allow restore.
  selfDeletedAt: timestamp("self_deleted_at", { withTimezone: true }),
  // Audit timestamp for legal/compliance: when user accepted the offer + privacy
  // policy. Nullable so existing seeded admins (who never saw the form) stay null.
  termsAcceptedAt: timestamp("terms_accepted_at", { withTimezone: true }),
  // Updated at last socket disconnect to drive the "был(а) в сети N минут
  // назад" presence label. While a socket is open the user is considered
  // online via the in-memory presence registry; this column is the durable
  // fallback after disconnect.
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true }),
  // Telegram identity link. Populated after the client confirms /start in
  // our centralised bot. telegram_user_id is the only stable handle (username
  // is mutable). All four columns clear together on unlink. UNIQUE on
  // telegram_user_id so two app accounts can't claim the same Telegram —
  // the bot prompts a re-link instead.
  telegramUserId: text("telegram_user_id").unique(),
  telegramUsername: text("telegram_username"),
  telegramFirstName: text("telegram_first_name"),
  telegramLinkedAt: timestamp("telegram_linked_at", { withTimezone: true }),
  // Optional pointer to a kaspi_links group for staff users. The column is
  // on users (not a join table) which naturally enforces the one-manager →
  // one-link constraint. Multiple managers can share a link by pointing at
  // the same id. Forward-reference via thunk because kaspi_links is
  // defined later in this file. SET NULL on link delete so removing a
  // group falls those managers back to the default link.
  kaspiLinkId: uuid("kaspi_link_id").references(
    (): AnyPgColumn => kaspiLinks.id,
    { onDelete: "set null" },
  ),
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

// Where the optional cover video is rendered on the mobile product detail
// page. 'replace' (default) — the video frame stands in for the cover image;
// 'below' — the cover image stays and the video appears beneath it as a
// secondary block. Mobile picks the layout per this column.
export const productVideoDisplayEnum = pgEnum("product_video_display", [
  "replace",
  "below",
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
    // Optional video that augments / replaces the cover on the mobile detail
    // page. Stored as one column — when it starts with /product-videos/ it's
    // an uploaded file, otherwise it's a YouTube URL (parsed client-side via
    // a youtube-id regex). Vimeo intentionally not supported yet.
    videoUrl: text("video_url"),
    videoDisplay: productVideoDisplayEnum("video_display")
      .notNull()
      .default("replace"),
    videoAutoplay: boolean("video_autoplay").notNull().default(false),
    // When non-null, buying this product grants access to the linked Telegram
    // chat. ON DELETE RESTRICT — admin can archive a group instead, which
    // does not break attached products. Mutually exclusive with
    // duration_minutes and lms_course_id — enforced by the CHECK below + the
    // route layer.
    telegramGroupId: uuid("telegram_group_id").references(
      (): AnyPgColumn => telegramGroups.id,
      { onDelete: "restrict" },
    ),
    // When non-null, buying this product grants access to the linked LMS
    // course. ON DELETE RESTRICT — admin archives a course instead. Mutually
    // exclusive with duration_minutes and telegram_group_id (a product is
    // exactly one fulfilment kind: booking, telegram, lms, or plain).
    lmsCourseId: uuid("lms_course_id").references(
      (): AnyPgColumn => lmsCourses.id,
      { onDelete: "restrict" },
    ),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("products_category_id_idx").on(t.categoryId),
    index("products_telegram_group_id_idx").on(t.telegramGroupId),
    index("products_lms_course_id_idx").on(t.lmsCourseId),
    // At most one fulfilment kind per row. Triple-pair pattern instead of an
    // arithmetic sum keeps the constraint readable and lets each pair fail
    // independently when staff submit a malformed payload directly.
    check(
      "products_fulfilment_kind_exclusive",
      sql`(${t.durationMinutes} IS NULL OR ${t.telegramGroupId} IS NULL)
        AND (${t.durationMinutes} IS NULL OR ${t.lmsCourseId} IS NULL)
        AND (${t.telegramGroupId} IS NULL OR ${t.lmsCourseId} IS NULL)`,
    ),
  ],
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

// Per-recipient delivery audit + the client-facing inbox. One row per push
// to a user, regardless of source: scheduled admin notifications (have a
// notification_id), or system pushes like order-status changes (notification_id
// NULL). title and body are SNAPSHOTTED at send time so editing or deleting
// the parent notifications row doesn't mutate what the user already saw —
// hence the SET NULL FK rather than CASCADE.
export const notificationDeliveries = pgTable(
  "notification_deliveries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    notificationId: uuid("notification_id").references(
      () => notifications.id,
      { onDelete: "set null" },
    ),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    body: text("body").notNull(),
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

// Where the money is at. 'pending' = order created, awaiting client receipt.
// 'paid' = manager confirmed Kaspi screenshot. 'unpaid' = manager rejected
// or 24h auto-flip. 'refunded' = paid then walked back. Cancellation as
// a concept lives on fulfillment_status, not here.
export const paymentStatusEnum = pgEnum("payment_status", [
  "pending",
  "paid",
  "unpaid",
  "refunded",
]);

// Where the order is in its lifecycle. 'new' = freshly created, payment not
// yet decided. 'active' = paid and the access window is open. 'completed' =
// the time-window expired (cron flips this) or the meeting passed.
// 'cancelled' = staff voided the order regardless of payment state.
//
// Auto-transitions out of 'new' happen inside changeOrderPaymentStatus when
// payment leaves 'pending': paid → fulfillment 'active'; unpaid/refunded →
// 'cancelled'. Once fulfillment leaves 'new', it's decoupled from payment.
export const fulfillmentStatusEnum = pgEnum("fulfillment_status", [
  "new",
  "active",
  "completed",
  "cancelled",
]);

// How the client paid. NULL on legacy/Kaspi orders — the manual Kaspi flow
// never recorded a method; 'card' is set when a BCC card payment is initiated.
// UI treats NULL as Kaspi. See docs/bcc-payment-integration.md.
export const paymentMethodEnum = pgEnum("payment_method", ["kaspi", "card"]);

// Provider-side state of a single BCC card-payment attempt
// (payment_transactions). Distinct from orders.payment_status, which the
// verified callback drives through changeOrderPaymentStatus.
export const bccTransactionStatusEnum = pgEnum("bcc_transaction_status", [
  "pending",
  "paid",
  "failed",
  "refunded",
]);

// Human-friendly 7+ digit order number shown in the UI ("№1210920"). Internal
// references still use uuid id; this column is for staff and clients who need
// to read or quote a number out loud. Starts at 1_000_000 so even the very
// first order looks like a real one.
export const ordersNumberSeq = pgSequence("orders_number_seq", {
  startWith: 1000000,
});

// Numeric reference sent to BCC as the ORDER field for each card-payment
// attempt. Separate from orders_number_seq so a retry of the same order gets a
// fresh value — BCC dedups on the low 6 digits within a day (ACTION=1 on a
// repeat). docs/bcc-payment-integration.md §3/§7.
export const bccOrderSeq = pgSequence("bcc_order_seq", {
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
      .default("pending"),
    fulfillmentStatus: fulfillmentStatusEnum("fulfillment_status")
      .notNull()
      .default("new"),
    // NULL for legacy/Kaspi orders; set to 'card' once a BCC card payment is
    // initiated for this order (POST /payments). UI treats NULL as Kaspi.
    paymentMethod: paymentMethodEnum("payment_method"),
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
    productDescription: text("product_description"),
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

// One BCC card-payment attempt against an order. An order may have several
// attempts (each a fresh bcc_order); the successful one carries the rrn/int_ref
// needed to refund or void later (TRTYPE=14/22). `status` tracks the provider
// side and is distinct from orders.payment_status — the verified callback (or
// the TRTYPE=90 reconcile) drives the order to 'paid' via
// changeOrderPaymentStatus. raw_request/raw_callback keep the full payloads for
// audit. See docs/bcc-payment-integration.md.
export const paymentTransactions = pgTable(
  "payment_transactions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    provider: text("provider").notNull().default("bcc"),
    // The numeric ORDER sent to BCC. Sequence-generated so it's globally unique
    // (numeric, >6 digits, unique low-6/day — BCC's duplicate rule).
    bccOrder: integer("bcc_order")
      .notNull()
      .unique()
      .default(sql`nextval('bcc_order_seq')`),
    // Per-attempt CSPRNG nonce — hex, upper-case, no dashes. Secondary key the
    // callback can be matched on.
    nonce: text("nonce").notNull().unique(),
    amountTenge: numeric("amount_tenge", { precision: 12, scale: 2 }).notNull(),
    status: bccTransactionStatusEnum("status").notNull().default("pending"),
    // Last result codes from BCC (callback or TRTYPE=90 status check).
    action: text("action"),
    rc: text("rc"),
    rcText: text("rc_text"),
    // Populated from a successful purchase — required to refund/void (TRTYPE=14/22).
    rrn: text("rrn"),
    intRef: text("int_ref"),
    cardMask: text("card_mask"),
    rawRequest: jsonb("raw_request").$type<Record<string, string>>(),
    rawCallback: jsonb("raw_callback").$type<Record<string, string>>(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("payment_transactions_order_id_idx").on(t.orderId),
    index("payment_transactions_status_idx").on(t.status),
  ],
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

// Client-initiated request to cancel an active order. Distinct from staff
// flipping fulfillment_status to 'cancelled' directly from the order drawer:
// cancellations are an inbox of *requests* the manager decides on. When a
// request is approved, fulfillment_status is moved to 'cancelled' via the
// existing changeOrderFulfillmentStatus path (cascading coach_bookings).
//
// manager_id is a snapshot copied from orders.manager_id at request time —
// reassigning the client's manager later does not migrate historical
// requests. Nullable because some clients have no assigned manager (the
// admin-only seed window). At most one 'requested' row per order is enforced
// by a partial unique index — once decided, the row stays and the client may
// open a new request.
export const cancellationStatusEnum = pgEnum("cancellation_status", [
  "requested",
  "approved",
  "rejected",
]);

export const orderCancellations = pgTable(
  "order_cancellations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    clientId: uuid("client_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    managerId: uuid("manager_id").references(() => users.id, {
      onDelete: "set null",
    }),
    status: cancellationStatusEnum("status").notNull().default("requested"),
    // Optional free-form text the client typed into the confirmation dialog.
    // Shown to staff in the drawer; never shown back to the client.
    clientReason: text("client_reason"),
    // Internal note written by staff at decision time. Never surfaced to the
    // client (their only feedback is the approval/rejection push).
    decisionComment: text("decision_comment"),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
    decidedByUserId: uuid("decided_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("order_cancellations_order_id_idx").on(t.orderId),
    index("order_cancellations_manager_id_idx").on(t.managerId),
    index("order_cancellations_status_idx").on(t.status),
    index("order_cancellations_created_at_idx").on(t.createdAt),
    // At most one open request per order. Once decided the row stays in the
    // table for audit; a fresh row may then be inserted.
    uniqueIndex("order_cancellations_one_open_per_order")
      .on(t.orderId)
      .where(sql`${t.status} = 'requested'`),
  ],
);

// Product reviews. Created in 'pending' by the client (mobile) after a
// completed order; staff flips status to 'published' or 'deleted' from the
// staff "Отзывы" tab. 'deleted' is soft — the row stays for audit and the
// client never sees a deleted review (it just disappears from "Мои отзывы";
// no rejection notification per product spec). Multiple reviews per
// (client, product) are allowed by design — managers decide whether a repeat
// review is worth publishing.
//
// order_item_id is captured at submit time as the proof-of-purchase anchor
// (the client tapped "Оставить отзыв" from the corresponding completed
// order item). SET NULL on order_item delete keeps the review alive even if
// order history is later purged.
//
// Manager scoping at read time uses the *live* users.manager_id of the
// review's client_id — not a snapshot — so reassigning a client to a new
// manager moves their historical reviews along. (Orders/cancellations use
// snapshot manager_id today, pending a separate refactor.)
export const reviewStatusEnum = pgEnum("review_status", [
  "pending",
  "published",
  "deleted",
]);

export const productReviews = pgTable(
  "product_reviews",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "restrict" }),
    orderItemId: uuid("order_item_id").references(() => orderItems.id, {
      onDelete: "set null",
    }),
    clientId: uuid("client_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    rating: integer("rating").notNull(),
    text: text("text").notNull(),
    status: reviewStatusEnum("status").notNull().default("pending"),
    statusChangedAt: timestamp("status_changed_at", { withTimezone: true }),
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
    check("product_reviews_rating_range", sql`${t.rating} BETWEEN 1 AND 5`),
    index("product_reviews_product_id_status_created_at_idx").on(
      t.productId,
      t.status,
      t.createdAt,
    ),
    index("product_reviews_client_id_created_at_idx").on(
      t.clientId,
      t.createdAt,
    ),
    index("product_reviews_status_idx").on(t.status),
  ],
);

// Staff replies to a review. Multiple replies allowed (one-level thread,
// chronological). Soft-deleted via deleted_at — accidentally-deleted replies
// can be restored from the DB and audit history is preserved. Cascades on
// review hard-delete (which is an admin op only; the soft-delete UI flow
// keeps replies attached).
export const productReviewReplies = pgTable(
  "product_review_replies",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    reviewId: uuid("review_id")
      .notNull()
      .references(() => productReviews.id, { onDelete: "cascade" }),
    authorId: uuid("author_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    text: text("text").notNull(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("product_review_replies_review_id_created_at_idx").on(
      t.reviewId,
      t.createdAt,
    ),
    index("product_review_replies_author_id_idx").on(t.authorId),
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

// Telegram channels/supergroups onboarded for paid-access products. Bot must
// be admin in each registered chat. Admins onboard a chat in two ways:
//   1. Add bot to chat as admin → bot receives a /register command in-chat →
//      we create a row with chat info pulled from getChat. Admin sees it in
//      the settings panel and can rename/archive.
//   2. Manual: admin pastes chat_id in the settings panel → backend calls
//      getChat + getChatMember(bot.id) to verify, then creates the row.
//
// chat_id is stored as text — JS numbers cover Telegram's id range today, but
// keeping it opaque avoids any risk of precision loss and is what we pass
// straight back to Bot API calls anyway.
//
// bot_status mirrors the most recent verification: 'admin' = full required
// rights present; 'missing_rights' = admin but missing can_invite_users /
// can_restrict_members; 'not_admin' = bot in chat but not admin;
// 'not_member' = bot was removed; 'chat_not_found' = chat deleted or
// inaccessible. UI surfaces a coloured pill per row + blocks selecting the
// group on a product unless status='admin'.
export const telegramChatTypeEnum = pgEnum("telegram_chat_type", [
  "channel",
  "supergroup",
]);

export const telegramGroupBotStatusEnum = pgEnum(
  "telegram_group_bot_status",
  [
    "admin",
    "missing_rights",
    "not_admin",
    "not_member",
    "chat_not_found",
    "unknown",
  ],
);

export const telegramGroups = pgTable(
  "telegram_groups",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    chatId: text("chat_id").notNull().unique(),
    title: text("title").notNull(),
    chatType: telegramChatTypeEnum("chat_type").notNull(),
    // Public @username if the chat has one — useful for the mobile CTA which
    // can deep-link straight to the chat instead of an invite URL when the
    // user is already a member. Null for purely-private chats.
    inviteUsername: text("invite_username"),
    // Admin can write a freeform description shown to clients on the order
    // detail page (e.g. "Основной канал Жанны с разборами"). Optional.
    description: text("description"),
    botStatus: telegramGroupBotStatusEnum("bot_status")
      .notNull()
      .default("unknown"),
    botStatusCheckedAt: timestamp("bot_status_checked_at", {
      withTimezone: true,
    }),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    createdByUserId: uuid("created_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("telegram_groups_archived_at_idx").on(t.archivedAt),
    index("telegram_groups_bot_status_idx").on(t.botStatus),
  ],
);

// Single-use deep-link tokens used to bridge mobile → bot. The mobile app
// requests a token via POST /me/telegram/link-token, then opens
// https://t.me/<bot>?start=<token>. The bot looks the token up in /start,
// links the Telegram identity to the requesting user, then marks consumed.
//
// 15-minute TTL. Cleared rows stay for the audit window; a daily cron
// (Stage 4) can purge old consumed/expired rows. ON DELETE CASCADE so a
// user delete also wipes their pending tokens.
export const telegramLinkTokens = pgTable(
  "telegram_link_tokens",
  {
    token: text("token").primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    consumedAt: timestamp("consumed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("telegram_link_tokens_user_id_idx").on(t.userId),
    index("telegram_link_tokens_expires_at_idx").on(t.expiresAt),
  ],
);

// Per-(user, group, order_item) Telegram access grant. Lifecycle:
//   pending  → invite link created (or user not linked yet — we'll generate
//              one on demand). Order is paid + active.
//   joined   → chat_member update confirmed the user joined via our invite.
//   left     → user voluntarily left the chat.
//   kicked   → we removed the user (refund / cancel / expiry / unlink) OR
//              the chat owner kicked them out of band.
//   revoked  → the invite link was revoked before the user joined.
//
// The actual Telegram membership is per-(user, group); a single user may
// have multiple memberships in the same group (e.g. two overlapping orders).
// Granting/revoking is therefore a "is there any other active grant for this
// pair?" check — we only kick when the LAST grant goes away. Partial unique
// index keeps at most one active grant per (user, group, order_item) so
// double-clicks don't double-issue invites.
//
// expires_at mirrors order_items.expires_at when the parent product has
// activeDurationDays set. The Stage 4 cron (`startTelegramExpiryCron`)
// kicks expired memberships even when the order itself stays active (e.g.
// mixed bundle: perpetual + 30-day Telegram). Until then this column is
// informational only — order-level cancel/complete still drives kicks.
export const telegramMembershipStatusEnum = pgEnum(
  "telegram_membership_status",
  ["pending", "joined", "left", "kicked", "revoked"],
);

export const telegramMemberships = pgTable(
  "telegram_memberships",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    telegramGroupId: uuid("telegram_group_id")
      .notNull()
      .references(() => telegramGroups.id, { onDelete: "restrict" }),
    // Nullable for future "manual grant" cases (admin gives access outside
    // an order). SET NULL preserves audit when the order item is deleted.
    orderItemId: uuid("order_item_id").references(() => orderItems.id, {
      onDelete: "set null",
    }),
    status: telegramMembershipStatusEnum("status")
      .notNull()
      .default("pending"),
    // Full URL of the per-user invite link we issued (member_limit=1).
    // Cached so successive "Open Telegram" taps before the user joins
    // return the same URL instead of generating a new one each time.
    inviteLink: text("invite_link"),
    // Short opaque label set on createChatInviteLink.name (≤32 chars). Used
    // to correlate chat_member updates back to a specific membership when
    // multiple co-exist for the same user/group.
    inviteLinkName: text("invite_link_name"),
    // The DM message we sent to the user containing the invite card. We
    // edit it (or delete-as-fallback) when the user joins (refresh wording)
    // and again when the membership tears down (mark "Доступ закрыт"). Both
    // are nullable since: (1) an invite may be issued before the user has
    // linked Telegram (no DM yet); (2) older rows pre-date this tracking.
    inviteChatId: text("invite_chat_id"),
    inviteMessageId: integer("invite_message_id"),
    joinedAt: timestamp("joined_at", { withTimezone: true }),
    leftAt: timestamp("left_at", { withTimezone: true }),
    kickedAt: timestamp("kicked_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("telegram_memberships_user_id_idx").on(t.userId),
    index("telegram_memberships_group_id_idx").on(t.telegramGroupId),
    index("telegram_memberships_order_item_id_idx").on(t.orderItemId),
    index("telegram_memberships_status_idx").on(t.status),
    index("telegram_memberships_expires_at_idx").on(t.expiresAt),
    // At most one active membership per (user, group, order_item). NULL
    // order_item_id values are treated as distinct by Postgres so multiple
    // manual grants without an order can coexist (rare but allowed).
    uniqueIndex("telegram_memberships_active_uniq")
      .on(t.userId, t.telegramGroupId, t.orderItemId)
      .where(sql`${t.status} IN ('pending', 'joined')`),
  ],
);

// Custom OTP table for sign-up email verification. Replaces Firebase's default
// magic-link "Verify your email" message — we send a 6-digit code from our own
// SMTP and mark the Firebase user emailVerified=true via the admin SDK after a
// successful match. Firebase-uid is the identity (email is also stored for the
// hash salt + a search index).
export const emailVerificationCodes = pgTable(
  "email_verification_codes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    firebaseUid: text("firebase_uid").notNull(),
    email: text("email").notNull(),
    // SHA-256(code + email) — never store the plaintext OTP.
    codeHash: text("code_hash").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    attempts: integer("attempts").notNull().default(0),
    consumedAt: timestamp("consumed_at", { withTimezone: true }),
    ipAddress: text("ip_address"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("email_verification_codes_firebase_uid_idx").on(t.firebaseUid),
    index("email_verification_codes_email_idx").on(t.email),
  ],
);

// In-house LMS. A course is a flat list of modules; each module is a flat list
// of lessons; each lesson holds an HTML body authored from the admin TipTap
// editor (with images / videos uploaded via /lms/media and inlined as <img>
// / <video> tags). Access to a course is *derived* — the user has it if they
// own a paid + active order_item whose product.lms_course_id == course.id.
// We deliberately don't materialise enrollments: the order pipeline already
// is the source of truth for "what does this user own", same as for Telegram
// access (which also goes through orders, not a separate access table).
//
// Soft-delete via archived_at on courses (so historical orders keep
// referencing them via products.lms_course_id without RESTRICT failures).
// Modules and lessons are hard-deleted with CASCADE — they only exist within
// the course tree, never referenced from outside.
export const lmsCourses = pgTable(
  "lms_courses",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    title: text("title").notNull(),
    // Optional short description shown to clients on the course landing
    // before they tap into a module. Authored in plain text from the admin
    // (no HTML — that's lessons' job).
    description: text("description"),
    // Path under /lms-media/<file>; null falls back to the same purple gradient
    // used as the default product cover.
    coverImageUrl: text("cover_image_url"),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("lms_courses_archived_at_idx").on(t.archivedAt)],
);

export const lmsModules = pgTable(
  "lms_modules",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    courseId: uuid("course_id")
      .notNull()
      .references(() => lmsCourses.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("lms_modules_course_id_sort_idx").on(t.courseId, t.sortOrder),
  ],
);

export const lmsLessons = pgTable(
  "lms_lessons",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    moduleId: uuid("module_id")
      .notNull()
      .references(() => lmsModules.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    // Authored HTML — output of the admin TipTap editor. Empty string until
    // the author saves something. Mobile renders via flutter_html with custom
    // <video> support; admin and client never share component code, only the
    // HTML payload.
    contentHtml: text("content_html").notNull().default(""),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("lms_lessons_module_id_sort_idx").on(t.moduleId, t.sortOrder),
  ],
);

// PDF attachments hung off a lesson — separate from the inline HTML body so
// they're listed as a distinct "Материалы" section on mobile and rendered in
// a screenshot-protected full-screen viewer. We keep them in their own table
// (not a JSON column on lessons) so admin can reorder and delete individual
// files by id, and the mobile client can stream-download a single file with
// a bearer header without parsing a blob.
export const lmsLessonAttachments = pgTable(
  "lms_lesson_attachments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    lessonId: uuid("lesson_id")
      .notNull()
      .references(() => lmsLessons.id, { onDelete: "cascade" }),
    // Original filename from the uploader, shown in the list ("Глава 1.pdf").
    // Distinct from urlPath which is a uuid-named file on disk.
    fileName: text("file_name").notNull(),
    mimeType: text("mime_type").notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    // Path under /lms-attachments/<file>.
    urlPath: text("url_path").notNull(),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("lms_lesson_attachments_lesson_id_sort_idx").on(
      t.lessonId,
      t.sortOrder,
    ),
  ],
);

// Client-submitted feedback messages from the mobile app. Staff process them
// in the web admin "Обратная связь" inbox. manager_id is a snapshot of the
// client's manager_id at submit time so reassigning a client's manager later
// does not migrate historical messages (mirrors orders/cancellations).
//
// Status pipeline: new → in_progress → resolved. The sidebar badge counts
// rows in 'new' under the actor's RBAC scope. read_at is set on the first
// staff PATCH (audit only — does not affect the badge or pipeline).
export const feedbackStatusEnum = pgEnum("feedback_status", [
  "new",
  "in_progress",
  "resolved",
]);

export const feedback = pgTable(
  "feedback",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    clientId: uuid("client_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    managerId: uuid("manager_id").references(() => users.id, {
      onDelete: "set null",
    }),
    body: text("body").notNull(),
    status: feedbackStatusEnum("status").notNull().default("new"),
    // Internal team note. Never surfaced to the client.
    adminNote: text("admin_note"),
    // Captured at submit time from the mobile client. Used for diagnosing
    // version-specific issues; both nullable for forward-compat with new
    // clients that don't send them.
    clientPlatform: text("client_platform"),
    clientAppVersion: text("client_app_version"),
    // First-touch audit. Set by the first PATCH that mutates status or note.
    readAt: timestamp("read_at", { withTimezone: true }),
    readByUserId: uuid("read_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    resolvedByUserId: uuid("resolved_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("feedback_client_id_idx").on(t.clientId),
    index("feedback_manager_id_idx").on(t.managerId),
    index("feedback_status_idx").on(t.status),
    index("feedback_created_at_idx").on(t.createdAt),
  ],
);

// Kaspi.kz payment links the mobile app opens after order creation.
// Layout:
//   - Exactly one row has is_default=true (enforced by the partial unique
//     index below). It's the fallback for clients whose manager isn't in
//     any group, or when kaspi_strategy='single'.
//   - Other rows are "group" links with a label; managers join via
//     users.kaspi_link_id pointing at this row's id.
//
// The mobile resolver (GET /me/kaspi-link) reads kaspi_strategy and
// returns either the default link or the manager's group link.
export const kaspiLinks = pgTable(
  "kaspi_links",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    url: text("url").notNull(),
    label: text("label").notNull().default(""),
    isDefault: boolean("is_default").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    // At most one default link. Without the WHERE clause the unique would
    // fire on every is_default=false row too.
    uniqueIndex("kaspi_links_one_default")
      .on(t.isDefault)
      .where(sql`${t.isDefault}`),
  ],
);

// Static set of legal pages: about / privacy policy / terms of use / public
// offer. Slugs are fixed (the admin can edit content but never adds new
// records — the mobile app links by hard-coded slug). Content is the HTML
// produced by the LMS TipTap editor; mobile renders it via flutter_html.
export const legalDocuments = pgTable("legal_documents", {
  // 'about' | 'privacy' | 'terms' | 'offer' — text PK so the four slugs are
  // self-documenting and clients can request /legal/:slug verbatim.
  slug: text("slug").primaryKey(),
  title: text("title").notNull(),
  contentHtml: text("content_html").notNull().default(""),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  // Last admin who saved a change. Nullable so the seed insert (no actor)
  // doesn't need a fake user, and so a deleted admin doesn't break the row.
  updatedByUserId: uuid("updated_by_user_id").references(() => users.id, {
    onDelete: "set null",
  }),
});
