// lib/billingConfig.ts
// Centralized billing configuration for RxTrace India

export const PRICING = {
  // Monthly subscription costs
  handset_monthly: 200, // ₹200 per handset per month
  seat_monthly: 50, // ₹50 per seat per month

  // Per-scan costs
  box_scan: 0.1, // ₹0.10 per box scan
  carton_scan: 0.25, // ₹0.25 per carton scan
  pallet_scan: 0.5, // ₹0.50 per pallet scan

  // Alert thresholds
  low_balance_alert: 1000, // Alert when balance falls below ₹1000
  critical_balance: 500, // Critical alert at ₹500
  auto_freeze_threshold: 0, // Freeze account at ₹0

  // Plan configurations
  plans: {
    starter: {
      name: "Starter",
      max_handsets: 5,
      max_seats: 3,
      default_credit_limit: 5000,
      monthly_base: 0,
    },
    professional: {
      name: "Professional",
      max_handsets: 20,
      max_seats: 10,
      default_credit_limit: 20000,
      monthly_base: 0,
    },
    enterprise: {
      name: "Enterprise",
      max_handsets: 100,
      max_seats: 50,
      default_credit_limit: 100000,
      monthly_base: 0,
    },
  },
} as const;

// Type definitions
export type PlanType = keyof typeof PRICING.plans;
export type ScanType = "box" | "carton" | "pallet";

// Helper functions
export function calculateHandsetCost(handsetCount: number): number {
  return handsetCount * PRICING.handset_monthly;
}

export function calculateSeatCost(seatCount: number): number {
  return seatCount * PRICING.seat_monthly;
}

export function calculateScanCost(
  scanType: ScanType,
  quantity: number
): number {
  const costs = {
    box: PRICING.box_scan,
    carton: PRICING.carton_scan,
    pallet: PRICING.pallet_scan,
  };
  return costs[scanType] * quantity;
}

export function calculateTotalUsage(usage: {
  handsets?: number;
  seats?: number;
  box_scans?: number;
  carton_scans?: number;
  pallet_scans?: number;
}): number {
  const handsetCost = calculateHandsetCost(usage.handsets || 0);
  const seatCost = calculateSeatCost(usage.seats || 0);
  const boxCost = calculateScanCost("box", usage.box_scans || 0);
  const cartonCost = calculateScanCost("carton", usage.carton_scans || 0);
  const palletCost = calculateScanCost("pallet", usage.pallet_scans || 0);

  return Number(
    (handsetCost + seatCost + boxCost + cartonCost + palletCost).toFixed(2)
  );
}

export function getBalanceStatus(
  balance: number
): "healthy" | "low" | "critical" | "frozen" {
  if (balance <= PRICING.auto_freeze_threshold) return "frozen";
  if (balance <= PRICING.critical_balance) return "critical";
  if (balance <= PRICING.low_balance_alert) return "low";
  return "healthy";
}

export function formatCurrency(amount: number): string {
  return `₹${amount.toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export default PRICING;
