// PHASE-8: Subscription State Machine
// Defines valid states and transitions for subscriptions

/**
 * Valid subscription statuses in the system
 */
export type SubscriptionStatus =
  | 'TRIAL'      // Trial period (no payment required)
  | 'trialing'   // Trial period active (alternative naming)
  | 'PENDING'    // Payment pending, awaiting confirmation
  | 'ACTIVE'     // Fully active subscription
  | 'PAUSED'     // Temporarily paused, can be resumed
  | 'CANCELLED'  // Cancelled at period end or immediately
  | 'EXPIRED';   // Trial or subscription has expired

/**
 * State machine configuration for subscriptions
 * Defines valid transitions between states
 */
export const SUBSCRIPTION_STATES: Record<SubscriptionStatus, SubscriptionStatus[]> = {
  // Initial states
  'TRIAL': ['trialing', 'ACTIVE', 'PENDING', 'EXPIRED'],
  'trialing': ['TRIAL', 'ACTIVE', 'PENDING', 'EXPIRED'],
  
  // Payment pending state
  'PENDING': ['ACTIVE', 'CANCELLED', 'EXPIRED'],
  
  // Active subscription states
  'ACTIVE': ['PAUSED', 'CANCELLED', 'EXPIRED', 'PENDING'], // PENDING for upgrades
  'PAUSED': ['ACTIVE', 'CANCELLED', 'EXPIRED'],
  
  // Terminal states
  'CANCELLED': ['ACTIVE', 'PENDING'], // Can reactivate or start new
  'EXPIRED': ['ACTIVE', 'PENDING', 'TRIAL'], // Can start new subscription
};

/**
 * Check if a state transition is valid
 */
export function isValidTransition(
  fromStatus: SubscriptionStatus,
  toStatus: SubscriptionStatus
): boolean {
  const allowedTransitions = SUBSCRIPTION_STATES[fromStatus];
  if (!allowedTransitions) {
    return false;
  }
  return allowedTransitions.includes(toStatus);
}

/**
 * Get human-readable description of a transition
 */
export function getTransitionDescription(
  fromStatus: SubscriptionStatus,
  toStatus: SubscriptionStatus
): string {
  const descriptions: Record<string, string> = {
    'TRIAL→ACTIVE': 'Trial converted to paid subscription',
    'TRIAL→PENDING': 'Trial subscription upgrade initiated',
    'TRIAL→EXPIRED': 'Trial period ended without upgrade',
    'trialing→ACTIVE': 'Trial converted to paid subscription',
    'trialing→PENDING': 'Trial subscription upgrade initiated',
    'trialing→EXPIRED': 'Trial period ended without upgrade',
    'PENDING→ACTIVE': 'Payment confirmed, subscription activated',
    'PENDING→CANCELLED': 'Payment failed or cancelled',
    'PENDING→EXPIRED': 'Payment pending expired',
    'ACTIVE→PAUSED': 'Subscription paused temporarily',
    'ACTIVE→CANCELLED': 'Subscription cancelled',
    'ACTIVE→PENDING': 'Subscription upgrade initiated',
    'PAUSED→ACTIVE': 'Subscription resumed',
    'PAUSED→CANCELLED': 'Paused subscription cancelled',
    'CANCELLED→ACTIVE': 'Subscription reactivated',
    'CANCELLED→PENDING': 'New subscription started',
    'EXPIRED→ACTIVE': 'New subscription purchased',
    'EXPIRED→PENDING': 'New subscription started',
    'EXPIRED→TRIAL': 'New trial started',
  };

  return descriptions[`${fromStatus}→${toStatus}`] || `${fromStatus} → ${toStatus}`;
}

/**
 * Get features available for each status
 */
export function getFeaturesForStatus(status: SubscriptionStatus): string[] {
  const featureMap: Record<SubscriptionStatus, string[]> = {
    'TRIAL': [
      'Basic code generation',
      'Limited usage quotas',
      'Email support',
    ],
    'trialing': [
      'Basic code generation',
      'Limited usage quotas',
      'Email support',
    ],
    'PENDING': [
      'View subscription details',
      'Access pending activation features',
      'Customer support contact',
    ],
    'ACTIVE': [
      'Full code generation',
      'All usage quotas',
      'Email & chat support',
      'Priority processing',
      'API access',
    ],
    'PAUSED': [
      'View subscription details',
      'Resume subscription',
      'Customer support contact',
    ],
    'CANCELLED': [
      'View subscription history',
      'Start new subscription',
      'Customer support contact',
    ],
    'EXPIRED': [
      'View subscription history',
      'Start new subscription or trial',
      'Customer support contact',
    ],
  };

  return featureMap[status] || [];
}

/**
 * Get color for status badge
 */
export function getStatusColor(status: SubscriptionStatus): string {
  const colorMap: Record<SubscriptionStatus, string> = {
    'TRIAL': 'bg-green-100 text-green-800',
    'trialing': 'bg-green-100 text-green-800',
    'PENDING': 'bg-yellow-100 text-yellow-800',
    'ACTIVE': 'bg-blue-100 text-blue-800',
    'PAUSED': 'bg-orange-100 text-orange-800',
    'CANCELLED': 'bg-red-100 text-red-800',
    'EXPIRED': 'bg-gray-100 text-gray-800',
  };

  return colorMap[status] || 'bg-gray-100 text-gray-800';
}

/**
 * Get status priority (for sorting)
 */
export function getStatusPriority(status: SubscriptionStatus): number {
  const priorityMap: Record<SubscriptionStatus, number> = {
    'PENDING': 0,
    'ACTIVE': 1,
    'trialing': 2,
    'TRIAL': 3,
    'PAUSED': 4,
    'CANCELLED': 5,
    'EXPIRED': 6,
  };

  return priorityMap[status] ?? 99;
}
