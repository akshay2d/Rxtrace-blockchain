import crypto from "crypto";

export function generateSerial(jobId: string) {
  return jobId.slice(0,6) + Date.now().toString(36) +
         crypto.randomBytes(2).toString("hex");
}
