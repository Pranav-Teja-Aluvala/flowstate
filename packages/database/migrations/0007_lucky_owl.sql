CREATE TABLE "workspace_presence" (
	"workspace_id" uuid NOT NULL,
	"session_hash" text NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "workspace_presence_workspace_id_session_hash_pk" PRIMARY KEY("workspace_id","session_hash")
);
--> statement-breakpoint
ALTER TABLE "workspace_presence" ADD CONSTRAINT "workspace_presence_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_presence" ADD CONSTRAINT "workspace_presence_session_hash_sessions_token_hash_fk" FOREIGN KEY ("session_hash") REFERENCES "public"."sessions"("token_hash") ON DELETE cascade ON UPDATE no action;