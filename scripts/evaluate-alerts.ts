// PHASE-14: Alert Evaluation Job
// This script can be run periodically (via cron, GitHub Actions, etc.) to evaluate alerts

import { evaluateAlerts } from '../lib/alerting';
import { logInfo } from '../lib/observability';

/**
 * PHASE-14: Main alert evaluation function
 * Can be called from cron job, GitHub Actions, or scheduled task
 */
async function main() {
  try {
    logInfo('Starting alert evaluation', { timestamp: new Date().toISOString() });

    const result = await evaluateAlerts();

    logInfo('Alert evaluation completed', {
      evaluated: result.evaluated,
      triggered: result.triggered,
      timestamp: new Date().toISOString(),
    });

    // Exit with appropriate code
    if (result.triggered > 0) {
      console.log(`⚠️  ${result.triggered} alerts triggered`);
      process.exit(0); // Still exit 0 - alerts are expected behavior
    } else {
      console.log(`✅ No alerts triggered (${result.evaluated} rules evaluated)`);
      process.exit(0);
    }
  } catch (error: any) {
    console.error('Alert evaluation failed:', error);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  main();
}

export { main as evaluateAlertsJob };
