CREATE TYPE "public"."client_category" AS ENUM('new', 'regular', 'vip');--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "birth_date" date;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "client_category" "client_category" DEFAULT 'new' NOT NULL;