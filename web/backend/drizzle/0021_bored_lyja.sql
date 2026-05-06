CREATE TYPE "public"."telegram_membership_status" AS ENUM('pending', 'joined', 'left', 'kicked', 'revoked');--> statement-breakpoint
CREATE TABLE "telegram_link_tokens" (
	"token" text PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"consumed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "telegram_memberships" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"telegram_group_id" uuid NOT NULL,
	"order_item_id" uuid,
	"status" "telegram_membership_status" DEFAULT 'pending' NOT NULL,
	"invite_link" text,
	"invite_link_name" text,
	"joined_at" timestamp with time zone,
	"left_at" timestamp with time zone,
	"kicked_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "telegram_group_id" uuid;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "telegram_user_id" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "telegram_username" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "telegram_first_name" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "telegram_linked_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "telegram_link_tokens" ADD CONSTRAINT "telegram_link_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "telegram_memberships" ADD CONSTRAINT "telegram_memberships_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "telegram_memberships" ADD CONSTRAINT "telegram_memberships_telegram_group_id_telegram_groups_id_fk" FOREIGN KEY ("telegram_group_id") REFERENCES "public"."telegram_groups"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "telegram_memberships" ADD CONSTRAINT "telegram_memberships_order_item_id_order_items_id_fk" FOREIGN KEY ("order_item_id") REFERENCES "public"."order_items"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "telegram_link_tokens_user_id_idx" ON "telegram_link_tokens" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "telegram_link_tokens_expires_at_idx" ON "telegram_link_tokens" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "telegram_memberships_user_id_idx" ON "telegram_memberships" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "telegram_memberships_group_id_idx" ON "telegram_memberships" USING btree ("telegram_group_id");--> statement-breakpoint
CREATE INDEX "telegram_memberships_order_item_id_idx" ON "telegram_memberships" USING btree ("order_item_id");--> statement-breakpoint
CREATE INDEX "telegram_memberships_status_idx" ON "telegram_memberships" USING btree ("status");--> statement-breakpoint
CREATE INDEX "telegram_memberships_expires_at_idx" ON "telegram_memberships" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "telegram_memberships_active_uniq" ON "telegram_memberships" USING btree ("user_id","telegram_group_id","order_item_id") WHERE "telegram_memberships"."status" IN ('pending', 'joined');--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_telegram_group_id_telegram_groups_id_fk" FOREIGN KEY ("telegram_group_id") REFERENCES "public"."telegram_groups"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "products_telegram_group_id_idx" ON "products" USING btree ("telegram_group_id");--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_telegram_user_id_unique" UNIQUE("telegram_user_id");--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_booking_or_telegram_exclusive" CHECK ("products"."duration_minutes" IS NULL OR "products"."telegram_group_id" IS NULL);