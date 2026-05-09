CREATE TABLE "kaspi_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"url" text NOT NULL,
	"label" text DEFAULT '' NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "kaspi_link_id" uuid;--> statement-breakpoint
CREATE UNIQUE INDEX "kaspi_links_one_default" ON "kaspi_links" USING btree ("is_default") WHERE "kaspi_links"."is_default";--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_kaspi_link_id_kaspi_links_id_fk" FOREIGN KEY ("kaspi_link_id") REFERENCES "public"."kaspi_links"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
-- Seed the default link with the current mobile stub URL so behavior is
-- preserved post-deploy until the admin replaces it. Subsequent runs of
-- the migration are no-ops thanks to the WHERE NOT EXISTS guard.
INSERT INTO "kaspi_links" ("url", "label", "is_default")
SELECT 'https://kaspi.kz', 'По умолчанию', true
WHERE NOT EXISTS (SELECT 1 FROM "kaspi_links" WHERE "is_default" = true);