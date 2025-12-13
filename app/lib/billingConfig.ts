export const billingConfig = {
  pricing: {
    scan: {
      box: 0.2,
      carton: 1.0,
      pallet: 4.0,
    },
    generation: {
      unit: 0.1,
      boxSSCC: 0.2,
      cartonSSCC: 1.0,
      palletSSCC: 5.0,
    },
    device: {
      handsetActivationPerMonth: 100.0,
    },
    seat: {
      seatAllocationPerMonth: 200.0,
    },
  },

  billingRules: {
    chargeOn: {
      scan: "successful_scan",
      generation: "code_created",
      handsetActivation: "monthly_while_active",
      seatAllocation: "monthly_while_allocated",
    },
    blockOnInsufficientCredits: true,
  },
} as const;
