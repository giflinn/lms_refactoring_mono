-- Status-naming cleanup:
--   1) payment_status: rename 'new' → 'pending' (clearer semantics — money-axis
--      doesn't have a "new" idea).
--   2) fulfillment_status: introduce 'new' as the initial lifecycle state for
--      orders that haven't had their payment decided yet. Auto-transitions out
--      of 'new' happen in code (orderStatus.changeOrderPaymentStatus): on
--      'paid' → 'active', on 'unpaid'/'refunded' → 'cancelled'.
--
-- Notes on the recreate-enum dance below: PostgreSQL refuses
-- ALTER TYPE ... ADD VALUE inside a transaction block, and drizzle-kit wraps
-- each migration in one. Recreating the enum via a temp text column keeps the
-- whole change atomic.

-- 1. Rename payment value (RENAME is allowed inside a transaction)
ALTER TYPE "public"."payment_status" RENAME VALUE 'new' TO 'pending';--> statement-breakpoint

-- 2. Recreate fulfillment_status enum to add 'new' as the first value
DROP INDEX "orders_fulfillment_status_idx";--> statement-breakpoint

ALTER TABLE "orders" ADD COLUMN "fulfillment_status_old" text;--> statement-breakpoint
UPDATE "orders" SET "fulfillment_status_old" = "fulfillment_status"::text;--> statement-breakpoint

ALTER TABLE "orders" DROP COLUMN "fulfillment_status";--> statement-breakpoint
DROP TYPE "public"."fulfillment_status";--> statement-breakpoint

CREATE TYPE "public"."fulfillment_status" AS ENUM ('new', 'active', 'completed', 'cancelled');--> statement-breakpoint

ALTER TABLE "orders" ADD COLUMN "fulfillment_status" "fulfillment_status" DEFAULT 'new' NOT NULL;--> statement-breakpoint

-- 3. Backfill: rows that defaulted to 'active' on creation but never got a
--    payment decision should reflect the new 'new' state. Anything that
--    actually moved (completed/cancelled or active-with-paid) keeps its value.
UPDATE "orders" SET "fulfillment_status" =
  CASE
    WHEN "payment_status" = 'pending' AND "fulfillment_status_old" = 'active'
      THEN 'new'::"fulfillment_status"
    ELSE "fulfillment_status_old"::"fulfillment_status"
  END;--> statement-breakpoint

ALTER TABLE "orders" DROP COLUMN "fulfillment_status_old";--> statement-breakpoint

CREATE INDEX "orders_fulfillment_status_idx" ON "orders" USING btree ("fulfillment_status");

-- 4. Update orders.payment_status default — RENAME VALUE doesn't move the
--    default, but our schema declares 'pending' as the new default.
ALTER TABLE "orders" ALTER COLUMN "payment_status" SET DEFAULT 'pending';
