CREATE TYPE "public"."coach_slot_status" AS ENUM('active', 'cancelled');--> statement-breakpoint
CREATE TABLE "coach_slots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slot_type_id" uuid NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"status" "coach_slot_status" DEFAULT 'active' NOT NULL,
	"created_by_user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "coach_slots_ends_after_starts" CHECK ("coach_slots"."ends_at" > "coach_slots"."starts_at")
);
--> statement-breakpoint
ALTER TABLE "coach_slots" ADD CONSTRAINT "coach_slots_slot_type_id_slot_types_id_fk" FOREIGN KEY ("slot_type_id") REFERENCES "public"."slot_types"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coach_slots" ADD CONSTRAINT "coach_slots_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "coach_slots_starts_at_idx" ON "coach_slots" USING btree ("starts_at");--> statement-breakpoint
CREATE INDEX "coach_slots_slot_type_id_idx" ON "coach_slots" USING btree ("slot_type_id");