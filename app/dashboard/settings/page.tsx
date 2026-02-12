"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { supabaseClient } from "@/lib/supabase/client";
import { useSubscription } from "@/lib/hooks/useSubscription";
import TaxSettingsPanel from "@/components/settings/TaxSettingsPanel";
import PrinterSettingsPanel from "@/components/settings/PrinterSettingsPanel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

type UserProfile = {
  id: string;
  email: string;
  full_name: string | null;
  phone?: string | null;
};

type CompanyProfile = {
  id: string;
  company_name: string | null;
  pan: string | null;
  gst_number: string | null;
  address: string | null;
  email: string | null;
  user_id: string;
  profile_completed?: boolean | null;
};

export default function Page() {
  const router = useRouter();
  const { subscription, loading: subscriptionLoading, refresh } = useSubscription();

  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [userLoading, setUserLoading] = useState(true);
  const [userSaving, setUserSaving] = useState(false);
  const [userFormData, setUserFormData] = useState({ full_name: "", phone: "" });
  const [userError, setUserError] = useState("");
  const [userSuccess, setUserSuccess] = useState("");

  const [companyProfile, setCompanyProfile] = useState<CompanyProfile | null>(null);
  const [companyLoading, setCompanyLoading] = useState(true);
  const [companyFormData, setCompanyFormData] = useState({
    company_name: "",
    pan: "",
    gst: "",
    address: "",
  });

  const [trialLoading, setTrialLoading] = useState(false);
  const [trialError, setTrialError] = useState("");

  // ---------------------------
  // Fetch User Profile
  // ---------------------------
  useEffect(() => {
    async function fetchUser() {
      const supabase = supabaseClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setUserLoading(false);
        return;
      }

      const { data: profile } = await supabase
        .from("user_profiles")
        .select("id,email,full_name")
        .eq("id", user.id)
        .maybeSingle();

      if (profile) {
        setUserProfile(profile);
        setUserFormData({
          full_name: profile.full_name || "",
          phone: "",
        });
      } else {
        setUserProfile({
          id: user.id,
          email: user.email || "",
          full_name: user.user_metadata?.full_name || null,
        });
      }

      setUserLoading(false);
    }

    fetchUser();
  }, []);

  // ---------------------------
  // Fetch Company
  // ---------------------------
  useEffect(() => {
    async function fetchCompany() {
      const supabase = supabaseClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setCompanyLoading(false);
        return;
      }

      const { data } = await supabase
        .from("companies")
        .select("*")
        .eq("user_id", user.id)
        .maybeSingle();

      if (data) {
        setCompanyProfile(data);
        setCompanyFormData({
          company_name: data.company_name || "",
          pan: data.pan || "",
          gst: data.gst_number || "",
          address: data.address || "",
        });
      }

      setCompanyLoading(false);
    }

    fetchCompany();
  }, []);

  // ---------------------------
  // Trial
  // ---------------------------
  async function handleStartTrial() {
    setTrialLoading(true);
    setTrialError("");

    try {
      const res = await fetch("/api/trial/activate", { method: "POST" });
      const data = await res.json();

      if (!res.ok) {
        setTrialError(data.error || "Failed to start trial");
        return;
      }

      await refresh();
    } catch (err: any) {
      setTrialError(err.message);
    } finally {
      setTrialLoading(false);
    }
  }

  async function handleCancelTrial() {
    setTrialLoading(true);
    setTrialError("");

    try {
      const res = await fetch("/api/trial/cancel", { method: "POST" });
      const data = await res.json();

      if (!res.ok) {
        setTrialError(data.error || "Failed to cancel trial");
        return;
      }

      await refresh();
    } catch (err: any) {
      setTrialError(err.message);
    } finally {
      setTrialLoading(false);
    }
  }

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

  // ============================
  // UI
  // ============================

  return (
    <div className="max-w-5xl mx-auto px-8 py-10 space-y-8">
      <h1 className="text-3xl font-semibold">Settings</h1>

      {/* Trial Section */}
      {!subscriptionLoading && (
        <div className="bg-white border rounded-2xl p-8 space-y-6">
          <h2 className="text-xl font-medium">Trial Management</h2>

          {trialError && (
            <div className="text-red-600 text-sm">{trialError}</div>
          )}

          {subscription?.trial_end ? (
            <div className="space-y-4">
              <Badge className="bg-green-600 text-white">
                Trial Active
              </Badge>

              <div className="text-xl font-bold">
                {daysLeft} {daysLeft === 1 ? "day" : "days"} left
              </div>

              <div className="flex gap-3">
                <Button
                  variant="outline"
                  onClick={handleCancelTrial}
                  disabled={trialLoading}
                >
                  {trialLoading ? "Cancelling..." : "Cancel Trial"}
                </Button>

                <Button onClick={() => router.push("/pricing")}>
                  View Plans
                </Button>
              </div>
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
      )}

      {/* ERP Ingestion */}
      <div className="bg-white border rounded-2xl p-8 space-y-4">
        <h2 className="text-xl font-medium">ERP Code Ingestion</h2>
        <p className="text-sm text-gray-600">
          Import ERP-generated serialization data via CSV upload.
        </p>

        <Link
          href="/dashboard/settings/erp-integration"
          className="inline-flex px-4 py-2 bg-blue-600 text-white rounded-md"
        >
          Go to ERP Ingestion →
        </Link>
      </div>

      {/* Tax Settings */}
      {!companyLoading && (
        <TaxSettingsPanel
          companyId={companyProfile?.id || ""}
          profileCompleted={companyProfile?.profile_completed === true}
          initialPan={companyFormData.pan}
          initialGstNumber={companyFormData.gst}
        />
      )}

      {/* Printer Settings */}
      {!companyLoading && (
        <PrinterSettingsPanel companyId={companyProfile?.id || null} />
      )}
    </div>
  );
}
