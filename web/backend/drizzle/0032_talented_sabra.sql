ALTER TABLE "payment_transactions" ALTER COLUMN "bcc_order" DROP DEFAULT;--> statement-breakpoint
DROP SEQUENCE "public"."bcc_order_seq";