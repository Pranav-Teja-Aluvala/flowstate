ALTER TABLE "documents" ADD COLUMN "kind" text DEFAULT 'richtext' NOT NULL;--> statement-breakpoint
ALTER TABLE "repositories" ADD COLUMN "access_mode" text DEFAULT 'app' NOT NULL;