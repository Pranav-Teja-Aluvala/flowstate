CREATE TABLE "project_file_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"file_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"size" integer NOT NULL,
	"storage_key" text NOT NULL,
	"storage_provider" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "project_file_versions_storage_key_unique" UNIQUE("storage_key")
);
--> statement-breakpoint
ALTER TABLE "project_files" ADD COLUMN "version" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "project_files" ADD COLUMN "office_key" uuid DEFAULT gen_random_uuid() NOT NULL;--> statement-breakpoint
ALTER TABLE "project_files" ADD COLUMN "office_saved_key" uuid;--> statement-breakpoint
ALTER TABLE "project_files" ADD COLUMN "updated_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "project_file_versions" ADD CONSTRAINT "project_file_versions_file_id_project_files_id_fk" FOREIGN KEY ("file_id") REFERENCES "public"."project_files"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "project_file_version_number" ON "project_file_versions" USING btree ("file_id","version");