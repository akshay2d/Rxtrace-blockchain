export const billingConfig = {
  pricing: {
    scan: {
      box: 0.2,
      carton: 1.0,
      pallet: 4.0,
    },
    generation: {
      unit: 0.1, // ₹0.10 per unit label
      boxSSCC: 0.3, // ₹0.30 per box label
      cartonSSCC: 1.0, // ₹1.00 per carton label
      palletSSCC: 2.0, // ₹2.00 per pallet label
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
