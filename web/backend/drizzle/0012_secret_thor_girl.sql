CREATE TYPE "public"."notification_recurrence_unit" AS ENUM('week', 'month', 'year');--> statement-breakpoint
CREATE TYPE "public"."notification_status" AS ENUM('active', 'completed', 'cancelled');--> statement-breakpoint
CREATE TABLE "notification_deliveries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"notification_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"sent_at" timestamp with time zone DEFAULT now() NOT NULL,
	"read_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"category" "client_category",
	"scheduled_at" timestamp with time zone,
	"recurrence_unit" "notification_recurrence_unit",
	"recurrence_interval" integer,
	"recurrence_byweekday" text[],
	"starts_at" timestamp with time zone,
	"ends_at" timestamp with time zone,
	"next_fire_at" timestamp with time zone,
	"status" "notification_status" DEFAULT 'active' NOT NULL,
	"created_by_user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "notification_deliveries" ADD CONSTRAINT "notification_deliveries_notification_id_notifications_id_fk" FOREIGN KEY ("notification_id") REFERENCES "public"."notifications"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_deliveries" ADD CONSTRAINT "notification_deliveries_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "notification_deliveries_user_id_idx" ON "notification_deliveries" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "notification_deliveries_notification_id_idx" ON "notification_deliveries" USING btree ("notification_id");--> statement-breakpoint
CREATE INDEX "notifications_next_fire_at_idx" ON "notifications" USING btree ("next_fire_at");