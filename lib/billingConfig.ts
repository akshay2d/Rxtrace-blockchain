// lib/billingConfig.ts
// Centralized billing configuration for RxTrace India

export const PRICING = {
  // Label generation costs (per pricing page)
  unit_label: 0.1, // ₹0.10 per unit label
  box_label: 0.3, // ₹0.30 per box label
  carton_label: 1.0, // ₹1.00 per carton label
  pallet_label: 2.0, // ₹2.00 per pallet label (SSCC)
  
  // Handsets are currently unlimited in plans; keep for cost helpers.
  handset_monthly: 0,
  
  // Subscription & add-ons
  seat_monthly: 3000, // ₹3,000 per additional User ID per month

  // Per-scan costs (if different from generation)
  box_scan: 0.1, // ₹0.10 per box scan
  carton_scan: 0.25, // ₹0.25 per carton scan
  pallet_scan: 0.5, // ₹0.50 per pallet scan

  // Alert thresholds
  low_balance_alert: 1000, // Alert when balance falls below ₹1000
  critical_balance: 500, // Critical alert at ₹500
  auto_freeze_threshold: 0, // Freeze account at ₹0

  // Tax configuration (GST - apply only when company has valid GST number)
  TAX_RATE: 0.18, // 18% GST
  TAX_APPLIES_TO: ['subscription', 'addon'] as const,

  // Plan configurations
  // DEPRECATED: Subscription prices moved to database.
  // Use lib/billing/pricing.ts for price retrieval.
  // max_handsets: unlimited for all plans (handset activation has no limit)
  plans: {
    trial: {
      name: "Free Trial",
      max_handsets: 999999,
      max_seats: 1,
      unit_labels_quota: null, // null = unlimited for trials
      box_labels_quota: null,
      carton_labels_quota: null,
      pallet_labels_quota: null,
      sscc_labels_quota: null, // null = unlimited for trials
      default_credit_limit: 0,
    },
    starter: {
      name: "Starter",
      max_handsets: 999999,
      max_seats: 1,
      unit_labels_quota: 200000,
      box_labels_quota: 20000,
      carton_labels_quota: 2000,
      pallet_labels_quota: 500,
      sscc_labels_quota: 22500,
      default_credit_limit: 5000,
      // DEPRECATED: monthly_base: 9999 - use getPlanPrice('starter', 'monthly')
      // DEPRECATED: yearly_base: 99990 - use getPlanPrice('starter', 'yearly')
    },
    growth: {
      name: "Growth",
      max_handsets: 999999,
      max_seats: 5,
      unit_labels_quota: 1000000,
      box_labels_quota: 200000,
      carton_labels_quota: 20000,
      pallet_labels_quota: 2000,
      sscc_labels_quota: 222000,
      default_credit_limit: 20000,
      // DEPRECATED: monthly_base: 29999 - use getPlanPrice('growth', 'monthly')
      // DEPRECATED: yearly_base: 299990 - use getPlanPrice('growth', 'yearly')
    },
  },
} as const;

// Type definitions
export type PlanType = 'trial' | 'starter' | 'growth';
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
  const safeAmount = typeof amount === 'number' && Number.isFinite(amount) ? amount : 0;
  return `₹${safeAmount.toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export default PRICING;
