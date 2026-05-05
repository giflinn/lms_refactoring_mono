ALTER TABLE "notification_deliveries" DROP CONSTRAINT "notification_deliveries_notification_id_notifications_id_fk";--> statement-breakpoint
ALTER TABLE "notification_deliveries" ALTER COLUMN "notification_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "notification_deliveries" ADD COLUMN "title" text;--> statement-breakpoint
ALTER TABLE "notification_deliveries" ADD COLUMN "body" text;--> statement-breakpoint
UPDATE "notification_deliveries" d
  SET "title" = n."title", "body" = n."body"
  FROM "notifications" n
  WHERE d."notification_id" = n."id";--> statement-breakpoint
ALTER TABLE "notification_deliveries" ALTER COLUMN "title" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "notification_deliveries" ALTER COLUMN "body" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "notification_deliveries" ADD CONSTRAINT "notification_deliveries_notification_id_notifications_id_fk" FOREIGN KEY ("notification_id") REFERENCES "public"."notifications"("id") ON DELETE set null ON UPDATE no action;
