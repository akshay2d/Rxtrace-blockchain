'use client';

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card } from "@/components/ui/card";
import { supabase } from "@/lib/supabase";

export default function CompanySignUp() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);

    const formData = new FormData(e.currentTarget);
    const data = {
      companyName: formData.get("companyName") as string,
      contactName: formData.get("contactName") as string,
      email: formData.get("email") as string,
      phone: formData.get("phone") as string,
      address: formData.get("address") as string,
      industry: formData.get("industry") as string,
      businessType: formData.get("businessType") as string,
      skuCount: Number(formData.get("skuCount") || 0),
      gstNo: formData.get("gstNo") as string,
      gs1Letter: formData.get("gs1Letter") === "yes",
    };

    // Create user + company in Supabase
    const { data: authData, error: authError } = await supabase.auth.signUp({
      email: data.email,
      password: "temporary123", // will be changed on first login
      options: { data }
    });

    if (authError) {
      alert("Error: " + authError.message);
      setLoading(false);
      return;
    }

    // Auto login after signup
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: data.email,
      password: "temporary123",
    });

    if (signInError) {
      alert("Account created! Please check email to set password.");
    } else {
      router.push("/dashboard");
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-900 via-indigo-900 to-blue-900 flex items-center justify-center p-6">
      <Card className="w-full max-w-3xl bg-white/10 backdrop-blur-xl border-white/20 p-10">
        <h2 className="text-4xl font-bold text-center text-white mb-10">Register Your Company</h2>

        <form onSubmit={handleSubmit} className="space-y-8">
          {/* Your full form from previous message — all fields here */}
          {/* ... (same as before) ... */}

          <Button type="submit" disabled={loading} className="w-full bg-cyan-400 hover:bg-cyan-300 text-black font-bold text-xl py-8">
            {loading ? "Creating Account..." : "Create Company Account"}
          </Button>
        </form>
      </Card>
    </div>
  );
}