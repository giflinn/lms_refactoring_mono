CREATE TYPE "public"."apple_iap_status" AS ENUM('paid', 'refunded');--> statement-breakpoint
ALTER TYPE "public"."payment_method" ADD VALUE 'apple_iap';--> statement-breakpoint
CREATE TABLE "apple_iap_transactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"transaction_id" text NOT NULL,
	"original_transaction_id" text,
	"product_id" text NOT NULL,
	"environment" text NOT NULL,
	"status" "apple_iap_status" DEFAULT 'paid' NOT NULL,
	"raw_transaction" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "apple_iap_transactions_transaction_id_unique" UNIQUE("transaction_id")
);
--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "is_digital" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "ios_iap_product_id" text;--> statement-breakpoint
ALTER TABLE "apple_iap_transactions" ADD CONSTRAINT "apple_iap_transactions_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "apple_iap_transactions_order_id_idx" ON "apple_iap_transactions" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "apple_iap_transactions_transaction_id_idx" ON "apple_iap_transactions" USING btree ("transaction_id");