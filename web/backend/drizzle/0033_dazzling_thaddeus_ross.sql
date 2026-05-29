CREATE TABLE "bcc_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"payment_transaction_id" uuid,
	"order_id" uuid,
	"bcc_order" integer,
	"kind" text NOT NULL,
	"trtype" text,
	"outcome" text NOT NULL,
	"action" text,
	"rc" text,
	"rc_text" text,
	"http_status" integer,
	"note" text,
	"payload" jsonb
);
--> statement-breakpoint
ALTER TABLE "bcc_events" ADD CONSTRAINT "bcc_events_payment_transaction_id_payment_transactions_id_fk" FOREIGN KEY ("payment_transaction_id") REFERENCES "public"."payment_transactions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bcc_events" ADD CONSTRAINT "bcc_events_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "bcc_events_created_at_idx" ON "bcc_events" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "bcc_events_payment_transaction_id_idx" ON "bcc_events" USING btree ("payment_transaction_id");--> statement-breakpoint
CREATE INDEX "bcc_events_order_id_idx" ON "bcc_events" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "bcc_events_kind_idx" ON "bcc_events" USING btree ("kind");