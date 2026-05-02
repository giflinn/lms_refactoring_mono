CREATE TABLE "product_slot_types" (
	"product_id" uuid NOT NULL,
	"slot_type_id" uuid NOT NULL,
	CONSTRAINT "product_slot_types_product_id_slot_type_id_pk" PRIMARY KEY("product_id","slot_type_id")
);
--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "duration_minutes" integer;--> statement-breakpoint
ALTER TABLE "product_slot_types" ADD CONSTRAINT "product_slot_types_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_slot_types" ADD CONSTRAINT "product_slot_types_slot_type_id_slot_types_id_fk" FOREIGN KEY ("slot_type_id") REFERENCES "public"."slot_types"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "product_slot_types_slot_type_id_idx" ON "product_slot_types" USING btree ("slot_type_id");