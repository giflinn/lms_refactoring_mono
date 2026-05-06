CREATE TYPE "public"."product_video_display" AS ENUM('replace', 'below');--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "video_url" text;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "video_display" "product_video_display" DEFAULT 'replace' NOT NULL;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "video_autoplay" boolean DEFAULT false NOT NULL;