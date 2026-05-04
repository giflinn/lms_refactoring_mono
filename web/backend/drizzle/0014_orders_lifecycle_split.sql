-- Splits orders.status into two orthogonal axes:
--   payment_status     — new | paid | unpaid | refunded   (money movement)
--   fulfillment_status — active | completed | cancelled    (lifecycle)
-- Adds the timer columns that drive auto-completion:
--   orders.first_paid_at      — set on first 'paid' transition
--   order_items.expires_at    — bookedEnd (bookable) or first_paid_at + N (time-bound)
--   products.active_duration_days — admin-configured N for time-bound products

-- 1. Create new enums
CREATE TYPE "public"."payment_status" AS ENUM ('new', 'paid', 'unpaid', 'refunded');--> statement-breakpoint
CREATE TYPE "public"."fulfillment_status" AS ENUM ('active', 'completed', 'cancelled');--> statement-breakpoint

-- 2. Add new columns to orders (defaults make backfill safe under NOT NULL)
ALTER TABLE "orders" ADD COLUMN "payment_status" "payment_status" DEFAULT 'new' NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "fulfillment_status" "fulfillment_status" DEFAULT 'active' NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "first_paid_at" timestamp with time zone;--> statement-breakpoint

-- 3. Backfill from old status. 'cancelled' splits: payment_status takes
--    'unpaid' as the safest assumption (no real refund happened in old data),
--    fulfillment_status takes 'cancelled'.
UPDATE "orders" SET "payment_status" =
  CASE "status"::text
    WHEN 'new' THEN 'new'::"payment_status"
    WHEN 'paid' THEN 'paid'::"payment_status"
    WHEN 'unpaid' THEN 'unpaid'::"payment_status"
    WHEN 'cancelled' THEN 'unpaid'::"payment_status"
  END;--> statement-breakpoint

UPDATE "orders" SET "fulfillment_status" =
  CASE "status"::text
    WHEN 'cancelled' THEN 'cancelled'::"fulfillment_status"
    ELSE 'active'::"fulfillment_status"
  END;--> statement-breakpoint

-- 4. first_paid_at: for currently-paid orders, use status_changed_at as a
--    best-effort timestamp (it's the closest thing we have to "when paid").
UPDATE "orders" SET "first_paid_at" = "status_changed_at"
  WHERE "payment_status" = 'paid';--> statement-breakpoint

-- 5. Drop old status column and its index, replace with two new indexes
DROP INDEX "orders_status_idx";--> statement-breakpoint
ALTER TABLE "orders" DROP COLUMN "status";--> statement-breakpoint
CREATE INDEX "orders_payment_status_idx" ON "orders" USING btree ("payment_status");--> statement-breakpoint
CREATE INDEX "orders_fulfillment_status_idx" ON "orders" USING btree ("fulfillment_status");--> statement-breakpoint

-- 6. order_items.expires_at — bookable items get their booked_end as the
--    expiry; non-bookable rows stay NULL (filled at first 'paid' transition).
ALTER TABLE "order_items" ADD COLUMN "expires_at" timestamp with time zone;--> statement-breakpoint
UPDATE "order_items" SET "expires_at" = "booked_end" WHERE "booked_end" IS NOT NULL;--> statement-breakpoint

-- 7. products.active_duration_days — admin sets per product. NULL for
--    bookable (handled via duration_minutes) and perpetual.
ALTER TABLE "products" ADD COLUMN "active_duration_days" integer;--> statement-breakpoint

-- 8. order_status_log — repurpose to track payment transitions only.
--    Convert columns from order_status to payment_status. Old 'cancelled'
--    rows become 'unpaid' here too; the audit trail is approximate but
--    legible.
ALTER TABLE "order_status_log"
  ALTER COLUMN "from_status" TYPE "payment_status"
  USING (CASE "from_status"::text
    WHEN 'cancelled' THEN 'unpaid'
    ELSE "from_status"::text
  END)::"payment_status";--> statement-breakpoint

ALTER TABLE "order_status_log"
  ALTER COLUMN "to_status" TYPE "payment_status"
  USING (CASE "to_status"::text
    WHEN 'cancelled' THEN 'unpaid'
    ELSE "to_status"::text
  END)::"payment_status";--> statement-breakpoint

-- 9. Old order_status enum is now unreferenced — drop it.
DROP TYPE "order_status";
