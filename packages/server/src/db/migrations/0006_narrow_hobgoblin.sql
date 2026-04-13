ALTER TABLE "runs" ADD COLUMN "tags" text[] DEFAULT '{}'::text[] NOT NULL;--> statement-breakpoint
ALTER TABLE "tests" ADD COLUMN "tags" text[] DEFAULT '{}'::text[] NOT NULL;