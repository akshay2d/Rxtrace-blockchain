"use client";

import React, { useState } from "react";

declare global {
  interface Window {
    Razorpay: any;
  }
}

export default function SubscriptionPage() {
  const [loading, setLoading] = useState(false);

  const RAZORPAY_KEY_ID = "YOUR_RAZORPAY_KEY_ID"; // keep as env if already used
  const CORRECT_PLAN_ID = "plan_REPLACE_WITH_CORRECT_PLAN";

  const handleSubscribe = async () => {
    setLoading(true);

    try {
      // Always create a FRESH subscription on backend
      const response = await fetch("/api/create-subscription", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          plan_id: CORRECT_PLAN_ID,
          customer_details: {
            name: "User Name",
            email: "user@example.com",
            contact: "9999999999",
          },
        }),
      });

      if (!response.ok) {
        throw new Error("Subscription creation failed");
      }

      const { subscription_id } = await response.json();

      if (!subscription_id) {
        throw new Error("Missing subscription_id from backend");
      }

      const options = {
        key: RAZORPAY_KEY_ID,
        subscription_id,
        name: "Rxtrace",
        description: "Blockchain Subscription",
        theme: { color: "#3399cc" },
        prefill: {
          name: "User Name",
          email: "user@example.com",
          contact: "9999999999",
        },
        handler: function (response: any) {
          console.log("Payment Success", response);
          // backend verification handled separately
        },
        modal: {
          ondismiss: () => setLoading(false),
        },
      };

      const razorpay = new window.Razorpay(options);
      razorpay.open();
    } catch (err) {
      console.error("Razorpay Error:", err);
      alert("Subscription failed. Please try again.");
      setLoading(false);
    }
  };

  return (
    <div className="flex items-center justify-center min-h-screen bg-gray-100">
      <div className="bg-white p-8 rounded shadow">
        <h1 className="text-xl font-bold mb-4">Subscribe</h1>
        <button
          onClick={handleSubscribe}
          disabled={loading}
          className="px-6 py-3 bg-blue-600 text-white rounded disabled:opacity-50"
        >
          {loading ? "Processing..." : "Subscribe Now"}
        </button>
      </div>
    </div>
  );
}
