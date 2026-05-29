CREATE TYPE "public"."bcc_transaction_status" AS ENUM('pending', 'paid', 'failed', 'refunded');--> statement-breakpoint
CREATE TYPE "public"."payment_method" AS ENUM('kaspi', 'card');--> statement-breakpoint
CREATE SEQUENCE "public"."bcc_order_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1000000 CACHE 1;--> statement-breakpoint
CREATE TABLE "payment_transactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"provider" text DEFAULT 'bcc' NOT NULL,
	"bcc_order" integer DEFAULT nextval('bcc_order_seq') NOT NULL,
	"nonce" text NOT NULL,
	"amount_tenge" numeric(12, 2) NOT NULL,
	"status" "bcc_transaction_status" DEFAULT 'pending' NOT NULL,
	"action" text,
	"rc" text,
	"rc_text" text,
	"rrn" text,
	"int_ref" text,
	"card_mask" text,
	"raw_request" jsonb,
	"raw_callback" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payment_transactions_bcc_order_unique" UNIQUE("bcc_order"),
	CONSTRAINT "payment_transactions_nonce_unique" UNIQUE("nonce")
);
--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "payment_method" "payment_method";--> statement-breakpoint
ALTER TABLE "payment_transactions" ADD CONSTRAINT "payment_transactions_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "payment_transactions_order_id_idx" ON "payment_transactions" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "payment_transactions_status_idx" ON "payment_transactions" USING btree ("status");