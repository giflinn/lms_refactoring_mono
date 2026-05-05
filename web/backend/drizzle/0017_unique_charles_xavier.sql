CREATE TYPE "public"."cancellation_status" AS ENUM('requested', 'approved', 'rejected');--> statement-breakpoint
CREATE TABLE "order_cancellations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"manager_id" uuid,
	"status" "cancellation_status" DEFAULT 'requested' NOT NULL,
	"client_reason" text,
	"decision_comment" text,
	"decided_at" timestamp with time zone,
	"decided_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "order_cancellations" ADD CONSTRAINT "order_cancellations_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_cancellations" ADD CONSTRAINT "order_cancellations_client_id_users_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_cancellations" ADD CONSTRAINT "order_cancellations_manager_id_users_id_fk" FOREIGN KEY ("manager_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_cancellations" ADD CONSTRAINT "order_cancellations_decided_by_user_id_users_id_fk" FOREIGN KEY ("decided_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "order_cancellations_order_id_idx" ON "order_cancellations" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "order_cancellations_manager_id_idx" ON "order_cancellations" USING btree ("manager_id");--> statement-breakpoint
CREATE INDEX "order_cancellations_status_idx" ON "order_cancellations" USING btree ("status");--> statement-breakpoint
CREATE INDEX "order_cancellations_created_at_idx" ON "order_cancellations" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "order_cancellations_one_open_per_order" ON "order_cancellations" USING btree ("order_id") WHERE "order_cancellations"."status" = 'requested';