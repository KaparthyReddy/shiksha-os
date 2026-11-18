CREATE TABLE "audit_anchors" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"last_audit_id" bigint NOT NULL,
	"head_hash" text NOT NULL,
	"entries" integer NOT NULL,
	"ok" boolean NOT NULL,
	"emailed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "receipt_emailed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "audit_anchors" ADD CONSTRAINT "audit_anchors_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audit_anchors_tenant_idx" ON "audit_anchors" USING btree ("tenant_id","last_audit_id");