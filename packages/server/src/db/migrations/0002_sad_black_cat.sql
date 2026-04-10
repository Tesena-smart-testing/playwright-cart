CREATE TABLE "report_tokens" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"token_hash" text NOT NULL,
	"file_path" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "report_tokens_hash_uniq" ON "report_tokens" USING btree ("token_hash");