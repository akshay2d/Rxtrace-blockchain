import { getSupabaseAdmin } from "@/lib/supabase/admin";

export async function writeAuditLog({
  companyId,
  actor,
  action,
  status,
  integrationSystem,
  metadata,
}: {
  companyId: string;
  actor: string;
  action: string;
  status: "success" | "failed";
  integrationSystem?: string;
  metadata?: Record<string, any>;
}) {
  const supabase = getSupabaseAdmin();
  const { error } = await supabase.from("audit_logs").insert({
    company_id: companyId,
    actor,
    action,
    status,
    integration_system: integrationSystem,
    metadata,
  });

  if (error) {
    throw new Error(error.message);
  }
}
