"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSubscription } from "@/lib/hooks/useSubscription";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import TaxSettingsPanel from "@/components/settings/TaxSettingsPanel";
import PrinterSettingsPanel from "@/components/settings/PrinterSettingsPanel";
import { supabaseClient } from "@/lib/supabase/client";

export default function SettingsPage() {
  const router = useRouter();
  const { subscription, loading, refresh } = useSubscription();

  const [trialLoading, setTrialLoading] = useState(false);
  const [trialError, setTrialError] = useState("");
  const [companyId, setCompanyId] = useState<string | null>(null);

  // Fetch company once on mount
  useState(() => {
    async function loadCompany() {
      const supabase = supabaseClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) return;

      const { data } = await supabase
        .from("companies")
        .select("id")
        .eq("user_id", user.id)
        .maybeSingle();

      if (data?.id) {
        setCompanyId(data.id);
      }
    }

    loadCompany();
  });

  const daysLeft =
    subscription?.trial_end
      ? Math.max(
          0,
          Math.ceil(
            (new Date(subscription.trial_end).getTime() -
              new Date().getTime()) /
              (1000 * 60 * 60 * 24)
          )
        )
      : 0;

  async function handleStartTrial() {
    setTrialLoading(true);
    setTrialError("");

    try {
      const res = await fetch("/api/trial/activate", {
        method: "POST",
      });

      const data = await res.json();

      if (!res.ok) {
        setTrialError(data.error || "Failed to start trial");
        return;
      }

      await refresh();
    } catch (err: any) {
      setTrialError(err.message || "Error starting trial");
    } finally {
      setTrialLoading(false);
    }
  }

  async function handleCancelTrial() {
    setTrialLoading(true);
    setTrialError("");

    try {
      const res = await fetch("/api/trial/cancel", {
        method: "POST",
      });

      const data = await res.json();

      if (!res.ok) {
        setTrialError(data.error || "Failed to cancel trial");
        return;
      }

      await refresh();
    } catch (err: any) {
      setTrialError(err.message || "Error cancelling trial");
    } finally {
      setTrialLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="p-6 text-gray-500">
        Loading trial details...
      </div>
    );
  }

  const trialActive =
    subscription?.status === "TRIAL" ||
    subscription?.status === "trialing";

  return (
    <div className="max-w-5xl mx-auto px-8 py-10 space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">
          Settings
        </h1>
        <p className="text-gray-500 mt-2">
          Pilot configuration and system setup.
        </p>
      </div>

      {/* Trial Section */}
      <div className="bg-white border border-gray-200 rounded-2xl shadow-sm p-6 space-y-4">
        <h2 className="text-xl font-medium">Trial</h2>

        {trialError && (
          <div className="text-red-600 text-sm">{trialError}</div>
        )}

        {trialActive ? (
          <div className="space-y-3">
            <Badge className="bg-green-600 text-white">
              Trial Active
            </Badge>

            <p className="text-sm text-gray-600">
              {daysLeft} {daysLeft === 1 ? "day" : "days"} left
            </p>

            <Button
              variant="outline"
              onClick={handleCancelTrial}
              disabled={trialLoading}
            >
              {trialLoading ? "Cancelling..." : "Cancel Trial"}
            </Button>
          </div>
        ) : (
          <Button
            onClick={handleStartTrial}
            disabled={trialLoading}
          >
            {trialLoading ? "Starting..." : "Start Free Trial"}
          </Button>
        )}
      </div>

      {/* ERP Ingestion */}
      <div className="bg-white border border-gray-200 rounded-2xl shadow-sm p-6 space-y-4">
        <h2 className="text-xl font-medium">
          ERP Code Ingestion
        </h2>
        <p className="text-sm text-gray-600">
          Import ERP-generated serialization data via CSV upload.
        </p>

        <Link
          href="/dashboard/settings/erp-integration"
          className="inline-flex px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition"
        >
          Go to ERP Ingestion →
        </Link>
      </div>

      {/* Tax Settings */}
      {companyId && (
        <div className="bg-white border border-gray-200 rounded-2xl shadow-sm p-6">
          <TaxSettingsPanel
            companyId={companyId}
            profileCompleted={true}
            initialPan=""
            initialGstNumber=""
          />
        </div>
      )}

      {/* Printer Settings */}
      {companyId && (
        <div className="bg-white border border-gray-200 rounded-2xl shadow-sm p-6">
          <PrinterSettingsPanel companyId={companyId} />
        </div>
      )}
    </div>
  );
}
