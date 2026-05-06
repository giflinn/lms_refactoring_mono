CREATE TYPE "public"."review_status" AS ENUM('pending', 'published', 'deleted');--> statement-breakpoint
CREATE TABLE "product_review_replies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"review_id" uuid NOT NULL,
	"author_id" uuid NOT NULL,
	"text" text NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "product_reviews" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"product_id" uuid NOT NULL,
	"order_item_id" uuid,
	"client_id" uuid NOT NULL,
	"rating" integer NOT NULL,
	"text" text NOT NULL,
	"status" "review_status" DEFAULT 'pending' NOT NULL,
	"status_changed_at" timestamp with time zone,
	"status_changed_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "product_reviews_rating_range" CHECK ("product_reviews"."rating" BETWEEN 1 AND 5)
);
--> statement-breakpoint
ALTER TABLE "product_review_replies" ADD CONSTRAINT "product_review_replies_review_id_product_reviews_id_fk" FOREIGN KEY ("review_id") REFERENCES "public"."product_reviews"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_review_replies" ADD CONSTRAINT "product_review_replies_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_reviews" ADD CONSTRAINT "product_reviews_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_reviews" ADD CONSTRAINT "product_reviews_order_item_id_order_items_id_fk" FOREIGN KEY ("order_item_id") REFERENCES "public"."order_items"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_reviews" ADD CONSTRAINT "product_reviews_client_id_users_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_reviews" ADD CONSTRAINT "product_reviews_status_changed_by_user_id_users_id_fk" FOREIGN KEY ("status_changed_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "product_review_replies_review_id_created_at_idx" ON "product_review_replies" USING btree ("review_id","created_at");--> statement-breakpoint
CREATE INDEX "product_review_replies_author_id_idx" ON "product_review_replies" USING btree ("author_id");--> statement-breakpoint
CREATE INDEX "product_reviews_product_id_status_created_at_idx" ON "product_reviews" USING btree ("product_id","status","created_at");--> statement-breakpoint
CREATE INDEX "product_reviews_client_id_created_at_idx" ON "product_reviews" USING btree ("client_id","created_at");--> statement-breakpoint
CREATE INDEX "product_reviews_status_idx" ON "product_reviews" USING btree ("status");