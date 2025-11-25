// lib/formatRupee.ts
export function formatRupee(amount: number): string {
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: "INR",
      minimumFractionDigits: 2,
    }).format(amount);
  }
  
  export function toGs1Mrp(mrp: number): string {
    return Math.round(mrp * 100).toString().padStart(8, "0");
  }