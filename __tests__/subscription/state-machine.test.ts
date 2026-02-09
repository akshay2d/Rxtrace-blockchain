// PHASE-8: Unit tests for subscription state machine
import { describe, it, expect } from 'vitest';
import {
  isValidTransition,
  getTransitionDescription,
  getFeaturesForStatus,
  getStatusColor,
  getStatusPriority,
  SubscriptionStatus,
  SUBSCRIPTION_STATES,
} from '@/lib/subscription/state-machine';

describe('Subscription State Machine', () => {
  describe('isValidTransition', () => {
    describe('Valid transitions from TRIAL', () => {
      it('should allow TRIAL → ACTIVE', () => {
        expect(isValidTransition('TRIAL', 'ACTIVE')).toBe(true);
      });

      it('should allow TRIAL → PENDING', () => {
        expect(isValidTransition('TRIAL', 'PENDING')).toBe(true);
      });

      it('should allow TRIAL → EXPIRED', () => {
        expect(isValidTransition('TRIAL', 'EXPIRED')).toBe(true);
      });

      it('should allow TRIAL → trialing', () => {
        expect(isValidTransition('TRIAL', 'trialing')).toBe(true);
      });
    });

    describe('Valid transitions from PENDING', () => {
      it('should allow PENDING → ACTIVE (payment confirmed)', () => {
        expect(isValidTransition('PENDING', 'ACTIVE')).toBe(true);
      });

      it('should allow PENDING → CANCELLED (payment failed)', () => {
        expect(isValidTransition('PENDING', 'CANCELLED')).toBe(true);
      });

      it('should allow PENDING → EXPIRED (timeout)', () => {
        expect(isValidTransition('PENDING', 'EXPIRED')).toBe(true);
      });

      it('should NOT allow PENDING → PAUSED', () => {
        expect(isValidTransition('PENDING', 'PAUSED')).toBe(false);
      });
    });

    describe('Valid transitions from ACTIVE', () => {
      it('should allow ACTIVE → PAUSED', () => {
        expect(isValidTransition('ACTIVE', 'PAUSED')).toBe(true);
      });

      it('should allow ACTIVE → CANCELLED', () => {
        expect(isValidTransition('ACTIVE', 'CANCELLED')).toBe(true);
      });

      it('should allow ACTIVE → PENDING (upgrade started)', () => {
        expect(isValidTransition('ACTIVE', 'PENDING')).toBe(true);
      });

      it('should allow ACTIVE → EXPIRED', () => {
        expect(isValidTransition('ACTIVE', 'EXPIRED')).toBe(true);
      });
    });

    describe('Valid transitions from PAUSED', () => {
      it('should allow PAUSED → ACTIVE (resume)', () => {
        expect(isValidTransition('PAUSED', 'ACTIVE')).toBe(true);
      });

      it('should allow PAUSED → CANCELLED', () => {
        expect(isValidTransition('PAUSED', 'CANCELLED')).toBe(true);
      });

      it('should NOT allow PAUSED → PENDING', () => {
        expect(isValidTransition('PAUSED', 'PENDING')).toBe(false);
      });
    });

    describe('Valid transitions from CANCELLED', () => {
      it('should allow CANCELLED → ACTIVE (reactivate)', () => {
        expect(isValidTransition('CANCELLED', 'ACTIVE')).toBe(true);
      });

      it('should allow CANCELLED → PENDING (new subscription)', () => {
        expect(isValidTransition('CANCELLED', 'PENDING')).toBe(true);
      });

      it('should NOT allow CANCELLED → PAUSED', () => {
        expect(isValidTransition('CANCELLED', 'PAUSED')).toBe(false);
      });
    });

    describe('Valid transitions from EXPIRED', () => {
      it('should allow EXPIRED → ACTIVE (new subscription)', () => {
        expect(isValidTransition('EXPIRED', 'ACTIVE')).toBe(true);
      });

      it('should allow EXPIRED → PENDING (new subscription started)', () => {
        expect(isValidTransition('EXPIRED', 'PENDING')).toBe(true);
      });

      it('should allow EXPIRED → TRIAL (new trial)', () => {
        expect(isValidTransition('EXPIRED', 'TRIAL')).toBe(true);
      });

      it('should NOT allow EXPIRED → PAUSED', () => {
        expect(isValidTransition('EXPIRED', 'PAUSED')).toBe(false);
      });
    });
  });

  describe('getTransitionDescription', () => {
    it('should return description for PENDING → ACTIVE', () => {
      expect(getTransitionDescription('PENDING', 'ACTIVE')).toBe(
        'Payment confirmed, subscription activated'
      );
    });

    it('should return description for TRIAL → PENDING', () => {
      expect(getTransitionDescription('TRIAL', 'PENDING')).toBe(
        'Trial subscription upgrade initiated'
      );
    });

    it('should return default description for unknown transitions', () => {
      expect(getTransitionDescription('ACTIVE', 'EXPIRED')).toBe('ACTIVE → EXPIRED');
    });

    it('should return description for ACTIVE → PAUSED', () => {
      expect(getTransitionDescription('ACTIVE', 'PAUSED')).toBe(
        'Subscription paused temporarily'
      );
    });

    it('should return description for PAUSED → ACTIVE', () => {
      expect(getTransitionDescription('PAUSED', 'ACTIVE')).toBe(
        'Subscription resumed'
      );
    });
  });

  describe('getFeaturesForStatus', () => {
    it('should return features for ACTIVE status', () => {
      const features = getFeaturesForStatus('ACTIVE');
      expect(features).toContain('Full code generation');
      expect(features).toContain('All usage quotas');
      expect(features).toContain('Email & chat support');
    });

    it('should return limited features for TRIAL status', () => {
      const features = getFeaturesForStatus('TRIAL');
      expect(features).toContain('Basic code generation');
      expect(features).not.toContain('All usage quotas');
    });

    it('should return minimal features for PENDING status', () => {
      const features = getFeaturesForStatus('PENDING');
      expect(features).toContain('View subscription details');
      expect(features).toContain('Customer support contact');
      expect(features).not.toContain('Full code generation');
    });

    it('should return features for PAUSED status', () => {
      const features = getFeaturesForStatus('PAUSED');
      expect(features).toContain('Resume subscription');
      expect(features).not.toContain('Full code generation');
    });
  });

  describe('getStatusColor', () => {
    it('should return yellow color for PENDING', () => {
      expect(getStatusColor('PENDING')).toBe('bg-yellow-100 text-yellow-800');
    });

    it('should return blue color for ACTIVE', () => {
      expect(getStatusColor('ACTIVE')).toBe('bg-blue-100 text-blue-800');
    });

    it('should return orange color for PAUSED', () => {
      expect(getStatusColor('PAUSED')).toBe('bg-orange-100 text-orange-800');
    });

    it('should return red color for CANCELLED', () => {
      expect(getStatusColor('CANCELLED')).toBe('bg-red-100 text-red-800');
    });

    it('should return gray color for EXPIRED', () => {
      expect(getStatusColor('EXPIRED')).toBe('bg-gray-100 text-gray-800');
    });
  });

  describe('getStatusPriority', () => {
    it('should return lowest number for PENDING', () => {
      expect(getStatusPriority('PENDING')).toBe(0);
    });

    it('should return 1 for ACTIVE', () => {
      expect(getStatusPriority('ACTIVE')).toBe(1);
    });

    it('should return higher numbers for terminal states', () => {
      expect(getStatusPriority('CANCELLED')).toBe(5);
      expect(getStatusPriority('EXPIRED')).toBe(6);
    });
  });

  describe('SUBSCRIPTION_STATES completeness', () => {
    const allStatuses: SubscriptionStatus[] = [
      'TRIAL',
      'trialing',
      'PENDING',
      'ACTIVE',
      'PAUSED',
      'CANCELLED',
      'EXPIRED',
    ];

    it('should have transition definitions for all statuses', () => {
      for (const status of allStatuses) {
        expect(SUBSCRIPTION_STATES[status]).toBeDefined();
        expect(Array.isArray(SUBSCRIPTION_STATES[status])).toBe(true);
      }
    });

    it('should have transitions defined for each status', () => {
      for (const status of allStatuses) {
        expect(SUBSCRIPTION_STATES[status].length).toBeGreaterThan(0);
      }
    });
  });
});
