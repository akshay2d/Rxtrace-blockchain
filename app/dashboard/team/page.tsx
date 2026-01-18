"use client";

import { useEffect, useState } from "react";
import { supabaseClient } from "@/lib/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Users, UserPlus, Mail, Shield, MoreVertical, AlertCircle } from "lucide-react";
import { loadRazorpay } from "@/lib/razorpay";
import { toast } from "sonner";
import { PRICING } from "@/lib/billingConfig";
import { normalizePlanType } from "@/lib/billing/period";

type Seat = {
  id: string;
  company_id: string;
  user_id: string | null;
  email: string | null;
  role: string | null;
  status: string;
  invited_at: string | null;
  activated_at: string | null;
  created_at: string;
};

type CompanyPlan = {
  plan: string;
  max_seats: number;
};

type SeatLimits = {
  plan: string;
  max_seats: number;
  used_seats: number;
  available_seats: number;
};

export default function TeamManagementPage() {
  const [seats, setSeats] = useState<Seat[]>([]);
  const [companyId, setCompanyId] = useState<string>("");
  const [companyPlan, setCompanyPlan] = useState<CompanyPlan | null>(null);
  const [seatLimits, setSeatLimits] = useState<SeatLimits | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [buyQuantity, setBuyQuantity] = useState<number>(1);
  
  // Invite form state
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("operator");
  const [inviteMessage, setInviteMessage] = useState("");

  // Reassign modal state
  const [reassignOpen, setReassignOpen] = useState(false);
  const [reassignSeatId, setReassignSeatId] = useState<string>("");
  const [reassignEmail, setReassignEmail] = useState<string>("");
  const [reassignInlineError, setReassignInlineError] = useState<string>("");

  useEffect(() => {
    fetchData();
  }, []);

  async function fetchData() {
    setLoading(true);
    setError("");
    
    try {
      const supabase = supabaseClient();
      
      // Get current user
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setError("Not authenticated");
        return;
      }

      // Get company
      const { data: company } = await supabase
        .from("companies")
        .select("*")
        .eq("user_id", user.id)
        .single();

      if (!company) {
        setError("No company found");
        return;
      }

      setCompanyId(company.id);

      // Always derive a local plan/limit fallback from company row so the UI
      // doesn't get stuck at 0 seats when seat-limits API fails.
      try {
        const planRaw =
          (company as any)?.subscription_plan ??
          (company as any)?.plan_type ??
          (company as any)?.plan ??
          (company as any)?.tier;
        const planType = normalizePlanType(planRaw) ?? "starter";
        const baseMax = PRICING.plans[planType].max_seats;
        const extra = Number((company as any)?.extra_user_seats ?? 0);
        const maxSeats = baseMax + (Number.isFinite(extra) ? extra : 0);
        setCompanyPlan({ plan: planType, max_seats: maxSeats });
      } catch {
        // ignore and keep defaults
      }

      // Fetch seat limits (server-side source of truth for plan + usage)
      const limitsRes = await fetch(`/api/admin/seat-limits?company_id=${company.id}`);
      const limitsBody = await limitsRes.json().catch(() => null);
      if (limitsRes.ok) {
        setSeatLimits(limitsBody as any);
        setCompanyPlan({
          plan: String((limitsBody as any)?.plan ?? "starter"),
          max_seats: Number((limitsBody as any)?.max_seats ?? 0),
        });
      } else {
        // Surface API errors so it's clear why seats look wrong.
        let msg = (limitsBody as any)?.error ? String((limitsBody as any).error) : "Failed to load seat limits";
        if (!limitsBody) {
          const text = await limitsRes.text().catch(() => "");
          const snippet = text ? text.slice(0, 180) : "";
          msg = `Failed to load seat limits (HTTP ${limitsRes.status}). ${snippet}`.trim();
        }
        setError(msg);
      }

      // Fetch seats
      const res = await fetch(`/api/admin/seats?company_id=${company.id}`);
      const data = await res.json();
      setSeats(data.seats ?? []);
      
    } catch (err: any) {
      console.error(err);
      setError(err.message || "Failed to load data");
    } finally {
      setLoading(false);
    }
  }

  async function handleInviteUser() {
    if (!inviteEmail.trim()) {
      toast.error("Please enter an email address");
      return;
    }

    setLoading(true);
    setError("");

    try {
      // Call API to send invite
      const res = await fetch("/api/admin/invite-user", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          company_id: companyId,
          email: inviteEmail,
          role: inviteRole,
          message: inviteMessage,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Failed to send invite");
        toast.error(data.error || "Failed to send invite");
        return;
      }

      toast.success(`Invitation sent to ${inviteEmail}`);
      setShowInviteModal(false);
      setInviteEmail("");
      setInviteRole("operator");
      setInviteMessage("");
      await fetchData();
      
    } catch (err: any) {
      setError(err.message || "Failed to send invite");
      toast.error(err.message || "Failed to send invite");
    } finally {
      setLoading(false);
    }
  }

  async function deactivateSeat(seatId: string) {
    if (!confirm("Deactivate this user? They will lose access immediately.")) {
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/seat/deactivate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ seat_id: seatId }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(body?.error || "Failed to deactivate");
      }
      toast.success("User ID deactivated");
      await fetchData();
    } catch (err: any) {
      setError(err.message || "Failed to deactivate");
      toast.error(err.message || "Failed to deactivate");
    } finally {
      setLoading(false);
    }
  }

  async function handleActivateSeat(seatId: string) {
    setLoading(true);
    try {
      const activatingToast = toast.loading("Activating User ID...");
      const res = await fetch("/api/seat/activate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ seat_id: seatId }),
      });

      const data = await res.json();
      if (!res.ok) {
        if (data?.requires_payment) {
          toast.dismiss(activatingToast);

          // Optimistic UI feedback while payment is in progress
          setSeats((prev) => prev.map((s) => (s.id === seatId ? { ...s, status: "pending" } : s)));
          await purchaseUserIdAddOn(1);

          const retryRes = await fetch("/api/seat/activate", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ seat_id: seatId }),
          });
          const retryBody = await retryRes.json().catch(() => ({}));
          if (!retryRes.ok) {
            throw new Error(retryBody?.error || "Activation failed after payment");
          }

          toast.success("User ID activated");
          await fetchData();
          return;
        }
        throw new Error(data?.error || "Activation failed");
      }

      toast.dismiss(activatingToast);
      toast.success("User ID activated");
      await fetchData();
    } catch (err: any) {
      console.error(err);
      setError(err.message || "Activation failed");
      toast.error(err.message || "Activation failed");
    } finally {
      setLoading(false);
    }
  }

  function isValidEmail(email: string) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim().toLowerCase());
  }

  function openReassignModal(seatId: string, currentEmail: string | null) {
    setReassignSeatId(seatId);
    setReassignEmail((currentEmail ?? "").trim());
    setReassignInlineError("");
    setReassignOpen(true);
  }

  async function submitReassign() {
    const email = reassignEmail.trim().toLowerCase();
    if (!email) {
      setReassignInlineError("Email is required");
      return;
    }
    if (!isValidEmail(email)) {
      setReassignInlineError("Enter a valid email address");
      return;
    }

    setLoading(true);
    setReassignInlineError("");
    try {
      const res = await fetch("/api/seat/reassign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ seat_id: reassignSeatId, email }),
      });

      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setReassignInlineError(body?.error || "Failed to reassign");
        return;
      }

      toast.success("User ID reassigned");
      setReassignOpen(false);
      await fetchData();
    } catch (err: any) {
      const msg = err.message || "Failed to reassign";
      setReassignInlineError(msg);
      setError(msg);
    } finally {
      setLoading(false);
    }
  }

  async function handleBuySeat() {
    setLoading(true);
    try {
      const qty = Number(buyQuantity);
      if (!Number.isFinite(qty) || !Number.isInteger(qty) || qty <= 0) {
        throw new Error("Quantity must be a positive integer");
      }
      if (qty > 50) {
        throw new Error("Quantity cannot exceed 50");
      }

      await purchaseUserIdAddOn(qty);
      await fetchData();
      toast.success("User ID purchased. You can invite more users now.");
    } catch (err: any) {
      console.error(err);
      setError(err.message || "Purchase failed");
      toast.error(err.message || "Purchase failed");
    } finally {
      setLoading(false);
    }
  }

  async function purchaseUserIdAddOn(quantity: number) {
    if (!companyId) throw new Error("Company not loaded");

    const ok = await loadRazorpay();
    if (!ok) throw new Error("Razorpay failed to load");

    // ₹3,000 / month per User ID
    const totalInr = 3000 * quantity;
    const purpose = `addon_userid_company_${companyId}_qty_${quantity}`;

    const res = await fetch("/api/razorpay/create-order", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ amount: totalInr, purpose }),
    });

    const body = await res.json();
    const order = body?.order ?? body;
    const keyId = body?.keyId ?? process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID;

    if (!res.ok || !order?.id) {
      throw new Error(order?.error || body?.error || "Failed to create Razorpay order");
    }
    if (!keyId) {
      throw new Error("Razorpay key not configured (NEXT_PUBLIC_RAZORPAY_KEY_ID)");
    }

    await new Promise<void>((resolve, reject) => {
      const rz = new (window as any).Razorpay({
        key: keyId,
        order_id: order.id,
        amount: order.amount,
        currency: "INR",
        name: "RxTrace",
        description: `Additional User ID (Qty: ${quantity})`,
        handler: async (resp: any) => {
          try {
            const verifyingToast = toast.loading("Confirming payment...");
            const verifyRes = await fetch("/api/addons/userid/activate", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                payment_id: resp.razorpay_payment_id,
                order_id: resp.razorpay_order_id,
                signature: resp.razorpay_signature,
              }),
            });
            const verifyBody = await verifyRes.json();
            if (!verifyRes.ok) {
              toast.dismiss(verifyingToast);
              throw new Error(verifyBody?.error || "Payment verification failed");
            }
            toast.dismiss(verifyingToast);
            resolve();
          } catch (e: any) {
            reject(e);
          }
        },
        modal: {
          ondismiss: () => reject(new Error("Payment cancelled")),
        },
        theme: { color: "#000000" },
      });
      rz.open();
    });
  }

  const activeSeats = seats.filter(s => s.status === "active");
  const pendingSeats = seats.filter(s => s.status === "pending");
  // Ensure minimum 1 active seat (primary user is always active)
  const usedSeatsCount = Math.max(1, activeSeats.length);
  const availableSeats = seatLimits 
    ? seatLimits.available_seats 
    : (companyPlan ? Math.max(0, companyPlan.max_seats - usedSeatsCount) : 0);

  const filteredSeats = seats.filter(s => 
    (s.email?.toLowerCase().includes(searchTerm.toLowerCase())) ||
    (s.role?.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Team & Users</h1>
          <p className="text-gray-600 mt-1">Manage user access, roles, and seat allocation</p>
        </div>
        {availableSeats > 0 ? (
          <Button
            onClick={() => setShowInviteModal(true)}
            className="bg-orange-500 hover:bg-orange-600"
            disabled={loading}
          >
            <UserPlus className="w-4 h-4 mr-2" />
            Invite User
          </Button>
        ) : (
          <div className="flex items-center gap-2">
            <Input
              type="number"
              min={1}
              max={50}
              value={buyQuantity}
              onChange={(e) => setBuyQuantity(Number(e.target.value))}
              className="w-24"
              aria-label="Quantity"
            />
            <Button
              onClick={handleBuySeat}
              className="bg-amber-500 hover:bg-amber-600"
              disabled={loading}
            >
              <UserPlus className="w-4 h-4 mr-2" />
              Buy User ID
            </Button>
          </div>
        )}
      </div>

      {/* Error Alert */}
      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-lg flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-5 h-5 text-red-600" />
            <p className="text-sm text-red-800">{error}</p>
          </div>
          <Button 
            variant="ghost" 
            size="sm"
            onClick={() => setError("")}
            className="text-red-600 hover:text-red-800"
          >
            ✕
          </Button>
        </div>
      )}

      {/* Seat Summary Display (Required Format) */}
      <Card className="border-gray-200">
        <CardHeader>
          <CardTitle className="text-lg font-semibold text-gray-900">Seat Usage</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="text-lg font-semibold text-gray-900">
              Seats: {seatLimits ? seatLimits.max_seats : Math.max(1, companyPlan?.max_seats ?? 1)} total | {seatLimits ? Math.max(1, seatLimits.used_seats) : Math.max(1, activeSeats.length)} active | {availableSeats} available
            </div>
            <div className="grid md:grid-cols-3 gap-4">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-sm font-medium text-gray-600">Total Allowed</CardTitle>
                  <Users className="w-5 h-5 text-blue-600" />
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-bold text-gray-900">
                    {seatLimits ? seatLimits.max_seats : (companyPlan?.max_seats ?? 1)}
                  </div>
                  <p className="text-xs text-gray-500 mt-1">
                    {companyPlan ? companyPlan.plan.charAt(0).toUpperCase() + companyPlan.plan.slice(1) : ''} Plan
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-sm font-medium text-gray-600">Active Users</CardTitle>
                  <Shield className="w-5 h-5 text-green-600" />
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-bold text-gray-900">
                    {seatLimits ? Math.max(1, seatLimits.used_seats) : usedSeatsCount}
                  </div>
                  <p className="text-xs text-gray-500 mt-1">
                    Currently using seats
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-sm font-medium text-gray-600">Available</CardTitle>
                  <Mail className="w-5 h-5 text-orange-600" />
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-bold text-gray-900">{availableSeats}</div>
                  <p className="text-xs text-gray-500 mt-1">
                    {pendingSeats.length > 0 ? `${pendingSeats.length} pending invites` : 'Seats available'}
                  </p>
                </CardContent>
              </Card>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Plan Limit Notice */}
      {availableSeats <= 0 && (
        <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-5 h-5 text-amber-600" />
            <div>
              <p className="text-sm font-medium text-amber-900">Seat limit reached</p>
              <p className="text-xs text-amber-700 mt-1">
                Upgrade your plan or purchase additional User IDs to invite more users. 
                Additional User IDs: ₹3,000/month each
              </p>
            </div>
          </div>
        </div>
      )}

      {/* User Table */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Team Members</CardTitle>
            <div className="flex gap-2">
              <Input
                placeholder="Search by email or role..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-64"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {filteredSeats.length === 0 && (
              <div className="text-center py-12 text-gray-500">
                <Users className="w-12 h-12 mx-auto mb-3 text-gray-400" />
                <p className="text-sm">No team members yet</p>
                <p className="text-xs mt-1">Click &ldquo;Invite User&rdquo; to get started</p>
              </div>
            )}

            {filteredSeats.map((seat) => (
              <div
                key={seat.id}
                className="flex items-center justify-between p-4 border rounded-lg hover:bg-gray-50 transition"
              >
                <div className="flex items-center gap-4 flex-1">
                  <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center">
                    <span className="text-sm font-semibold text-blue-700">
                      {seat.email?.charAt(0).toUpperCase() ?? "?"}
                    </span>
                  </div>
                  
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-gray-900">
                        {seat.email ?? "Unknown"}
                      </span>
                      <Badge variant={
                        seat.status === "active" ? "default" :
                        seat.status === "pending" ? "secondary" :
                        "outline"
                      }>
                        {seat.status}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-3 mt-1">
                      <span className="text-xs text-gray-500 flex items-center gap-1">
                        <Shield className="w-3 h-3" />
                        {seat.role ? seat.role.charAt(0).toUpperCase() + seat.role.slice(1) : "No role"}
                      </span>
                      {seat.activated_at && (
                        <span className="text-xs text-gray-400">
                          Active since {new Date(seat.activated_at).toLocaleDateString()}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {seat.status === "active" ? (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => deactivateSeat(seat.id)}
                      disabled={loading}
                    >
                      Deactivate User ID
                    </Button>
                  ) : seat.status === "pending" ? (
                    <Button variant="ghost" size="sm" disabled>
                      Pending activation
                    </Button>
                  ) : (
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => handleActivateSeat(seat.id)}
                      disabled={loading}
                    >
                      Activate User ID
                    </Button>
                  )}

                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => openReassignModal(seat.id, seat.email)}
                    disabled={loading}
                  >
                    Reassign
                  </Button>
                  <Button variant="ghost" size="sm">
                    <MoreVertical className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Invite Modal */}
      {showInviteModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <Card className="w-full max-w-lg">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <UserPlus className="w-5 h-5" />
                Invite New User
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label className="text-sm font-medium text-gray-700 mb-1 block">
                  Email Address *
                </label>
                <Input
                  type="email"
                  placeholder="user@company.com"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  disabled={loading}
                />
              </div>

              <div>
                <label className="text-sm font-medium text-gray-700 mb-1 block">
                  Assign Role *
                </label>
                <select
                  value={inviteRole}
                  onChange={(e) => setInviteRole(e.target.value)}
                  disabled={loading}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="admin">Admin - Full access</option>
                  <option value="manager">Manager - Generate & manage</option>
                  <option value="operator">Operator - Scan & basic ops</option>
                  <option value="viewer">Viewer - Read-only access</option>
                </select>
              </div>

              <div>
                <label className="text-sm font-medium text-gray-700 mb-1 block">
                  Welcome Message (Optional)
                </label>
                <textarea
                  placeholder="Welcome to our team! You'll receive access to..."
                  value={inviteMessage}
                  onChange={(e) => setInviteMessage(e.target.value)}
                  disabled={loading}
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
                <p className="text-xs text-blue-800">
                  <strong>Permissions Preview:</strong>
                </p>
                <ul className="text-xs text-blue-700 mt-2 space-y-1">
                  {inviteRole === "admin" && (
                    <>
                      <li>✓ Generate labels</li>
                      <li>✓ Manage users</li>
                      <li>✓ Access billing</li>
                      <li>✓ Full system access</li>
                    </>
                  )}
                  {inviteRole === "manager" && (
                    <>
                      <li>✓ Generate labels</li>
                      <li>✓ View reports</li>
                      <li>✓ Manage scans</li>
                      <li>✗ Manage users</li>
                    </>
                  )}
                  {inviteRole === "operator" && (
                    <>
                      <li>✓ Scan products</li>
                      <li>✓ Basic operations</li>
                      <li>✗ Generate labels</li>
                      <li>✗ Manage users</li>
                    </>
                  )}
                  {inviteRole === "viewer" && (
                    <>
                      <li>✓ View reports</li>
                      <li>✓ Search data</li>
                      <li>✗ Modify anything</li>
                    </>
                  )}
                </ul>
              </div>

              <div className="flex gap-2 justify-end">
                <Button
                  variant="outline"
                  onClick={() => setShowInviteModal(false)}
                  disabled={loading}
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleInviteUser}
                  disabled={loading || !inviteEmail.trim()}
                  className="bg-orange-500 hover:bg-orange-600"
                >
                  {loading ? "Sending..." : "Send Invite"}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      <AlertDialog
        open={reassignOpen}
        onOpenChange={(open) => {
          setReassignOpen(open);
          if (!open) {
            setReassignSeatId("");
            setReassignEmail("");
            setReassignInlineError("");
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reassign User ID</AlertDialogTitle>
            <AlertDialogDescription>
              Enter the new email address for this User ID.
            </AlertDialogDescription>
          </AlertDialogHeader>

          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-700">New Email</label>
            <Input
              type="email"
              placeholder="user@company.com"
              value={reassignEmail}
              onChange={(e) => setReassignEmail(e.target.value)}
              disabled={loading}
            />
            {reassignInlineError && (
              <div className="text-sm text-red-600">{reassignInlineError}</div>
            )}
          </div>

          <AlertDialogFooter>
            <AlertDialogCancel disabled={loading}>Cancel</AlertDialogCancel>
            <Button onClick={submitReassign} disabled={loading}>
              Reassign
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
