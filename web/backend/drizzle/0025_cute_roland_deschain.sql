ALTER TABLE "order_items" ADD COLUMN "product_description" text;
--> statement-breakpoint
UPDATE "order_items"
SET "product_description" = "products"."description"
FROM "products"
WHERE "order_items"."product_id" = "products"."id"
  AND "order_items"."product_description" IS NULL;