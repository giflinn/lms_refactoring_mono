CREATE TYPE "public"."chat_message_kind" AS ENUM('text', 'system');--> statement-breakpoint
CREATE TYPE "public"."fcm_platform" AS ENUM('ios', 'android');--> statement-breakpoint
CREATE TABLE "app_settings" (
	"key" text PRIMARY KEY NOT NULL,
	"value" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by_user_id" uuid
);
--> statement-breakpoint
CREATE TABLE "chat_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"thread_id" uuid NOT NULL,
	"sender_id" uuid NOT NULL,
	"body" text,
	"attachments" text,
	"kind" "chat_message_kind" DEFAULT 'text' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "chat_reads" (
	"thread_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"last_read_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "chat_reads_thread_id_user_id_pk" PRIMARY KEY("thread_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "chat_threads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_id" uuid NOT NULL,
	"last_message_at" timestamp with time zone,
	"last_message_preview" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "chat_threads_client_id_unique" UNIQUE("client_id")
);
--> statement-breakpoint
CREATE TABLE "user_fcm_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"token" text NOT NULL,
	"platform" "fcm_platform" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_fcm_tokens_token_unique" UNIQUE("token")
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "last_seen_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "app_settings" ADD CONSTRAINT "app_settings_updated_by_user_id_users_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_thread_id_chat_threads_id_fk" FOREIGN KEY ("thread_id") REFERENCES "public"."chat_threads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_sender_id_users_id_fk" FOREIGN KEY ("sender_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_reads" ADD CONSTRAINT "chat_reads_thread_id_chat_threads_id_fk" FOREIGN KEY ("thread_id") REFERENCES "public"."chat_threads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_reads" ADD CONSTRAINT "chat_reads_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_threads" ADD CONSTRAINT "chat_threads_client_id_users_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_fcm_tokens" ADD CONSTRAINT "user_fcm_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "chat_messages_thread_id_created_at_idx" ON "chat_messages" USING btree ("thread_id","created_at");--> statement-breakpoint
CREATE INDEX "chat_reads_user_id_idx" ON "chat_reads" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "chat_threads_last_message_at_idx" ON "chat_threads" USING btree ("last_message_at");--> statement-breakpoint
CREATE INDEX "user_fcm_tokens_user_id_idx" ON "user_fcm_tokens" USING btree ("user_id");