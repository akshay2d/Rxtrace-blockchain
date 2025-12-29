import { sendToSplunk } from "./splunk";

export async function emitSecurityEvent({
  companyId,
  actor,
  action,
  status,
  severity,
  integration,
  metadata,
}: {
  companyId: string;
  actor: string;
  action: string;
  status: "success" | "failed";
  severity: "low" | "medium" | "high";
  integration?: string;
  metadata?: Record<string, any>;
}) {
  await sendToSplunk({
    event: {
      system: "rxtrace",
      company_id: companyId,
      actor,
      action,
      status,
      severity,
      integration,
      metadata,
      timestamp: new Date().toISOString(),
    },
  });
}
