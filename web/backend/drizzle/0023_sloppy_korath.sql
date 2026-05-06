CREATE TABLE "lms_courses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"cover_image_url" text,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lms_lessons" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"module_id" uuid NOT NULL,
	"title" text NOT NULL,
	"content_html" text DEFAULT '' NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lms_modules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"course_id" uuid NOT NULL,
	"title" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "products" DROP CONSTRAINT "products_booking_or_telegram_exclusive";--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "lms_course_id" uuid;--> statement-breakpoint
ALTER TABLE "lms_lessons" ADD CONSTRAINT "lms_lessons_module_id_lms_modules_id_fk" FOREIGN KEY ("module_id") REFERENCES "public"."lms_modules"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lms_modules" ADD CONSTRAINT "lms_modules_course_id_lms_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."lms_courses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "lms_courses_archived_at_idx" ON "lms_courses" USING btree ("archived_at");--> statement-breakpoint
CREATE INDEX "lms_lessons_module_id_sort_idx" ON "lms_lessons" USING btree ("module_id","sort_order");--> statement-breakpoint
CREATE INDEX "lms_modules_course_id_sort_idx" ON "lms_modules" USING btree ("course_id","sort_order");--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_lms_course_id_lms_courses_id_fk" FOREIGN KEY ("lms_course_id") REFERENCES "public"."lms_courses"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "products_lms_course_id_idx" ON "products" USING btree ("lms_course_id");--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_fulfilment_kind_exclusive" CHECK (("products"."duration_minutes" IS NULL OR "products"."telegram_group_id" IS NULL)
        AND ("products"."duration_minutes" IS NULL OR "products"."lms_course_id" IS NULL)
        AND ("products"."telegram_group_id" IS NULL OR "products"."lms_course_id" IS NULL));