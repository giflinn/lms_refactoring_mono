CREATE TYPE "public"."telegram_chat_type" AS ENUM('channel', 'supergroup');--> statement-breakpoint
CREATE TYPE "public"."telegram_group_bot_status" AS ENUM('admin', 'missing_rights', 'not_admin', 'not_member', 'chat_not_found', 'unknown');--> statement-breakpoint
CREATE TABLE "telegram_groups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"chat_id" text NOT NULL,
	"title" text NOT NULL,
	"chat_type" "telegram_chat_type" NOT NULL,
	"invite_username" text,
	"description" text,
	"bot_status" "telegram_group_bot_status" DEFAULT 'unknown' NOT NULL,
	"bot_status_checked_at" timestamp with time zone,
	"archived_at" timestamp with time zone,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "telegram_groups_chat_id_unique" UNIQUE("chat_id")
);
--> statement-breakpoint
ALTER TABLE "telegram_groups" ADD CONSTRAINT "telegram_groups_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "telegram_groups_archived_at_idx" ON "telegram_groups" USING btree ("archived_at");--> statement-breakpoint
CREATE INDEX "telegram_groups_bot_status_idx" ON "telegram_groups" USING btree ("bot_status");