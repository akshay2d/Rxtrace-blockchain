"use client";

import { useState, useEffect } from "react";
import { supabaseClient } from "@/lib/supabase/client";

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
  gst: string | null;
  address: string | null;
  email: string | null;
  user_id: string;
};

export default function Page() {
  // User Profile state
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [userLoading, setUserLoading] = useState(true);
  const [userSaving, setUserSaving] = useState(false);
  const [userFormData, setUserFormData] = useState({ full_name: '', phone: '' });
  const [userError, setUserError] = useState('');
  const [userSuccess, setUserSuccess] = useState('');
  
  // Company Profile state
  const [companyProfile, setCompanyProfile] = useState<CompanyProfile | null>(null);
  const [companyLoading, setCompanyLoading] = useState(true);
  const [companySaving, setCompanySaving] = useState(false);
  const [companyFormData, setCompanyFormData] = useState({ company_name: '', pan: '', gst: '', address: '' });
  const [companyError, setCompanyError] = useState('');
  const [companySuccess, setCompanySuccess] = useState('');
  
  // ERP Integration state
  const [erpLoading, setErpLoading] = useState(false);
  const [erpSaved, setErpSaved] = useState(false);

  // Fetch user profile on mount
  useEffect(() => {
    async function fetchUserProfile() {
      try {
        const supabase = supabaseClient();
        const { data: { user } } = await supabase.auth.getUser();
        
        if (!user) {
          setUserLoading(false);
          return;
        }

        // Fetch user profile
        const { data: profile } = await supabase
          .from('user_profiles')
          .select('id, email, full_name')
          .eq('id', user.id)
          .maybeSingle();

        if (profile) {
          setUserProfile(profile);
          setUserFormData({
            full_name: profile.full_name || '',
            phone: '', // Phone may not be in user_profiles yet
          });
        } else {
          // Create profile if doesn't exist
          setUserProfile({
            id: user.id,
            email: user.email || '',
            full_name: user.user_metadata?.full_name || null,
            phone: null,
          });
          setUserFormData({
            full_name: user.user_metadata?.full_name || '',
            phone: '',
          });
        }
      } catch (err: any) {
        console.error('Failed to fetch user profile:', err);
      } finally {
        setUserLoading(false);
      }
    }

    fetchUserProfile();
  }, []);

  // Fetch company profile on mount
  useEffect(() => {
    async function fetchCompanyProfile() {
      try {
        const supabase = supabaseClient();
        const { data: { user } } = await supabase.auth.getUser();
        
        if (!user) {
          setCompanyLoading(false);
          return;
        }

        // Fetch company profile
        const { data: company } = await supabase
          .from('companies')
          .select('id, company_name, pan, gst, address, email, user_id')
          .eq('user_id', user.id)
          .maybeSingle();

        if (company) {
          setCompanyProfile(company);
          setCompanyFormData({
            company_name: company.company_name || '',
            pan: company.pan || '',
            gst: company.gst || '',
            address: company.address || '',
          });
        }
      } catch (err: any) {
        console.error('Failed to fetch company profile:', err);
      } finally {
        setCompanyLoading(false);
      }
    }

    fetchCompanyProfile();
  }, []);

  async function handleUserProfileSave(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setUserSaving(true);
    setUserError('');
    setUserSuccess('');

    try {
      const res = await fetch('/api/user/profile/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          full_name: userFormData.full_name,
          phone: userFormData.phone,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setUserError(data.error || 'Failed to update profile');
        return;
      }

      setUserSuccess('Profile updated successfully');
      if (data.profile) {
        setUserProfile(data.profile);
      }
    } catch (err: any) {
      setUserError(err.message || 'Failed to update profile');
    } finally {
      setUserSaving(false);
    }
  }

  async function handleCompanyProfileSave(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setCompanySaving(true);
    setCompanyError('');
    setCompanySuccess('');

    try {
      const res = await fetch('/api/company/profile/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          company_name: companyFormData.company_name,
          pan: companyFormData.pan,
          gst: companyFormData.gst,
          address: companyFormData.address,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setCompanyError(data.error || 'Failed to update company profile');
        return;
      }

      setCompanySuccess('Company profile updated successfully');
      if (data.company) {
        setCompanyProfile(data.company);
      }
    } catch (err: any) {
      setCompanyError(err.message || 'Failed to update company profile');
    } finally {
      setCompanySaving(false);
    }
  }

  async function handleErpSave(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErpLoading(true);
    setErpSaved(false);

    await fetch("/api/integrations/save", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        system: (e.currentTarget.system as HTMLSelectElement).value,
        apiUrl: (e.currentTarget.apiUrl as HTMLInputElement).value,
        apiKey: (e.currentTarget.apiKey as HTMLInputElement).value,
        syncMode: (e.currentTarget.sync as HTMLSelectElement).value,
      }),
    });

    setErpLoading(false);
    setErpSaved(true);
  }

  return (
    <div className="max-w-5xl mx-auto px-8 py-10 space-y-8">
      {/* Header */}
      <div className="mb-10">
        <h1 className="text-3xl font-semibold tracking-tight">
          Settings
        </h1>
        <p className="text-gray-500 mt-2 max-w-2xl">
          Manage your user profile, company information, and integrations.
        </p>
      </div>

      {/* User Profile Section */}
      <div className="bg-white border border-gray-200 rounded-2xl shadow-sm">
        <div className="p-8 space-y-6">
          <div>
            <h2 className="text-xl font-medium">User Profile</h2>
            <p className="text-sm text-gray-500 mt-1">
              Update your personal information. Email and User ID cannot be changed.
            </p>
          </div>

          {userLoading ? (
            <div className="p-4 text-gray-500">Loading profile...</div>
          ) : (
            <form onSubmit={handleUserProfileSave} className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Email (Read-only) */}
              <div>
                <label className="label">Email</label>
                <input
                  type="email"
                  className="input bg-gray-50 cursor-not-allowed"
                  value={userProfile?.email || ''}
                  disabled
                  readOnly
                />
                <p className="text-xs text-gray-500 mt-1">Email cannot be changed</p>
              </div>

              {/* User ID (Read-only, hidden by default) */}
              <div className="hidden">
                <label className="label">User ID</label>
                <input
                  type="text"
                  className="input bg-gray-50 cursor-not-allowed"
                  value={userProfile?.id || ''}
                  disabled
                  readOnly
                />
              </div>

              {/* Full Name (Editable) */}
              <div>
                <label className="label">Full Name</label>
                <input
                  type="text"
                  className="input"
                  value={userFormData.full_name}
                  onChange={(e) => setUserFormData({ ...userFormData, full_name: e.target.value })}
                  placeholder="Enter your full name"
                />
              </div>

              {/* Phone (Editable) */}
              <div>
                <label className="label">Phone</label>
                <input
                  type="tel"
                  className="input"
                  value={userFormData.phone}
                  onChange={(e) => setUserFormData({ ...userFormData, phone: e.target.value })}
                  placeholder="Enter your phone number"
                />
              </div>

              {/* Error/Success Messages */}
              <div className="md:col-span-2">
                {userError && (
                  <div className="text-sm text-red-600 mb-2">{userError}</div>
                )}
                {userSuccess && (
                  <div className="text-sm text-green-600 mb-2">{userSuccess}</div>
                )}
              </div>

              {/* Footer */}
              <div className="md:col-span-2 flex items-center justify-between pt-4">
                <div className="text-sm text-gray-500">
                  User ID: {userProfile?.id ? `${userProfile.id.substring(0, 8)}...` : 'N/A'}
                </div>
                <button
                  disabled={userSaving}
                  className="btn-primary px-6 py-2"
                >
                  {userSaving ? "Saving..." : "Save Profile"}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>

      {/* Password & Security Section */}
      <div className="bg-white border border-gray-200 rounded-2xl shadow-sm">
        <div className="p-8 space-y-6">
          <div>
            <h2 className="text-xl font-medium">Password & Security</h2>
            <p className="text-sm text-gray-500 mt-1">
              Update your account password. Use a strong password for better security.
            </p>
          </div>

          <form 
            onSubmit={(e) => {
              e.preventDefault();
              // UI-only validation - no backend implementation
              const form = e.currentTarget;
              const currentPassword = (form.currentPassword as HTMLInputElement).value;
              const newPassword = (form.newPassword as HTMLInputElement).value;
              const confirmPassword = (form.confirmPassword as HTMLInputElement).value;

              if (!currentPassword || !newPassword || !confirmPassword) {
                alert('All password fields are required');
                return;
              }

              if (newPassword !== confirmPassword) {
                alert('New password and confirm password do not match');
                return;
              }

              if (newPassword.length < 8) {
                alert('New password must be at least 8 characters long');
                return;
              }

              // UI-only - actual password update would be handled by backend
              alert('Password update functionality will be implemented by backend API');
              form.reset();
            }}
            className="grid grid-cols-1 md:grid-cols-2 gap-6"
          >
            {/* Current Password */}
            <div>
              <label className="label">Current Password *</label>
              <input
                name="currentPassword"
                type="password"
                className="input"
                placeholder="Enter current password"
                required
              />
            </div>

            {/* New Password */}
            <div>
              <label className="label">New Password *</label>
              <input
                name="newPassword"
                type="password"
                className="input"
                placeholder="Enter new password (min 8 characters)"
                required
                minLength={8}
              />
              <p className="text-xs text-gray-500 mt-1">Password must be at least 8 characters long</p>
            </div>

            {/* Confirm New Password */}
            <div className="md:col-span-2">
              <label className="label">Confirm New Password *</label>
              <input
                name="confirmPassword"
                type="password"
                className="input"
                placeholder="Confirm new password"
                required
                minLength={8}
              />
            </div>

            {/* Footer */}
            <div className="md:col-span-2 flex items-center justify-end pt-4 border-t">
              <button
                type="submit"
                className="btn-primary px-6 py-2"
              >
                Update Password
              </button>
            </div>
          </form>
        </div>
      </div>

      {/* Company Profile Section */}
      <div className="bg-white border border-gray-200 rounded-2xl shadow-sm">
        <div className="p-8 space-y-6">
          <div>
            <h2 className="text-xl font-medium">Company Profile</h2>
            <p className="text-sm text-gray-500 mt-1">
              Update your company information. Company ID, Owner Email, and Owner User ID cannot be changed.
            </p>
          </div>

          {companyLoading ? (
            <div className="p-4 text-gray-500">Loading company profile...</div>
          ) : companyProfile ? (
            <form onSubmit={handleCompanyProfileSave} className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Company ID (Read-only, hidden) */}
              <div className="hidden">
                <label className="label">Company ID</label>
                <input
                  type="text"
                  className="input bg-gray-50 cursor-not-allowed"
                  value={companyProfile.id}
                  disabled
                  readOnly
                />
              </div>

              {/* Owner Email (Read-only) */}
              <div>
                <label className="label">Owner Email</label>
                <input
                  type="email"
                  className="input bg-gray-50 cursor-not-allowed"
                  value={companyProfile.email || ''}
                  disabled
                  readOnly
                />
                <p className="text-xs text-gray-500 mt-1">Owner email cannot be changed</p>
              </div>

              {/* Owner User ID (Read-only) */}
              <div>
                <label className="label">Owner User ID</label>
                <input
                  type="text"
                  className="input bg-gray-50 cursor-not-allowed"
                  value={companyProfile.user_id ? `${companyProfile.user_id.substring(0, 8)}...` : ''}
                  disabled
                  readOnly
                />
                <p className="text-xs text-gray-500 mt-1">Owner User ID cannot be changed</p>
              </div>

              {/* Company Name (Editable) */}
              <div className="md:col-span-2">
                <label className="label">Company Name</label>
                <input
                  type="text"
                  className="input"
                  value={companyFormData.company_name}
                  onChange={(e) => setCompanyFormData({ ...companyFormData, company_name: e.target.value })}
                  placeholder="Enter company name"
                  required
                />
              </div>

              {/* PAN (Editable) */}
              <div>
                <label className="label">PAN Number</label>
                <input
                  type="text"
                  className="input"
                  value={companyFormData.pan}
                  onChange={(e) => setCompanyFormData({ ...companyFormData, pan: e.target.value.toUpperCase() })}
                  placeholder="Enter PAN number"
                  maxLength={10}
                />
              </div>

              {/* GST (Editable) */}
              <div>
                <label className="label">GST Number</label>
                <input
                  type="text"
                  className="input"
                  value={companyFormData.gst}
                  onChange={(e) => setCompanyFormData({ ...companyFormData, gst: e.target.value.toUpperCase() })}
                  placeholder="Enter GST number"
                />
              </div>

              {/* Address (Editable) */}
              <div className="md:col-span-2">
                <label className="label">Address</label>
                <textarea
                  className="input min-h-[100px]"
                  value={companyFormData.address}
                  onChange={(e) => setCompanyFormData({ ...companyFormData, address: e.target.value })}
                  placeholder="Enter company address"
                />
              </div>

              {/* Error/Success Messages */}
              <div className="md:col-span-2">
                {companyError && (
                  <div className="text-sm text-red-600 mb-2">{companyError}</div>
                )}
                {companySuccess && (
                  <div className="text-sm text-green-600 mb-2">{companySuccess}</div>
                )}
              </div>

              {/* Footer */}
              <div className="md:col-span-2 flex items-center justify-between pt-4">
                <div className="text-sm text-gray-500">
                  Company ID: {companyProfile.id ? `${companyProfile.id.substring(0, 8)}...` : 'N/A'}
                </div>
                <button
                  disabled={companySaving}
                  className="btn-primary px-6 py-2"
                >
                  {companySaving ? "Saving..." : "Save Company Profile"}
                </button>
              </div>
            </form>
          ) : (
            <div className="p-4 text-gray-500">No company profile found. Please complete onboarding first.</div>
          )}
        </div>
      </div>

      {/* ERP Integration Section */}
      <div className="bg-white border border-gray-200 rounded-2xl shadow-sm">
        <div className="p-8 space-y-8">
          <div>
            <h2 className="text-xl font-medium">
              ERP / SaaS Integration
            </h2>
            <p className="text-sm text-gray-500 mt-1">
              Securely connect RxTrace with your ERP or enterprise systems. Credentials are encrypted and never exposed.
            </p>
          </div>

          <form onSubmit={handleErpSave} className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="label">Integration System</label>
              <select name="system" className="input" required>
                <option value="">Select system</option>
                <option value="SAP">SAP</option>
                <option value="Oracle">Oracle</option>
                <option value="Tally">Tally</option>
                <option value="Custom">Custom ERP</option>
              </select>
            </div>

            <div>
              <label className="label">Sync Mode</label>
              <select name="sync" className="input">
                <option value="pull">Pull from ERP</option>
                <option value="push">Push to ERP</option>
                <option value="bi">Bi-Directional</option>
              </select>
            </div>

            <div className="md:col-span-2">
              <label className="label">API Base URL</label>
              <input
                name="apiUrl"
                className="input"
                placeholder="https://erp.company.com/api"
                required
              />
            </div>

            <div className="md:col-span-2">
              <label className="label">API Key / Token</label>
              <input
                name="apiKey"
                type="password"
                className="input"
                placeholder="••••••••••••••••"
                required
              />
              <p className="text-xs text-gray-500 mt-2">
                Stored encrypted. Visible only during creation.
              </p>
            </div>

            {/* Rotate API Key */}
            <div className="md:col-span-2 border-t pt-8 mt-10">
              <h3 className="text-lg font-medium mb-2">Rotate API Key</h3>
              <p className="text-sm text-gray-500 mb-4">
                Replace the existing API key. The old key will be permanently revoked.
              </p>

              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  const form = e.currentTarget as HTMLFormElement;
                  const newKey = (form.newKey as HTMLInputElement).value;

                  if (!confirm("This will revoke the old API key. Continue?")) return;

                  await fetch("/api/integrations/rotate-key", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ apiKey: newKey }),
                  });

                  alert("API key rotated successfully");
                  form.reset();
                }}
                className="space-y-4 max-w-lg"
              >
                <div>
                  <label className="label">New API Key</label>
                  <input
                    name="newKey"
                    type="password"
                    className="input"
                    placeholder="••••••••••••••••"
                    required
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    This key will be stored securely and never shown again.
                  </p>
                </div>

                <button className="btn-primary">
                  Rotate API Key
                </button>
              </form>
            </div>

            {/* Footer */}
            <div className="md:col-span-2 flex items-center justify-between pt-4">
              <div className="text-sm">
                {erpSaved && (
                  <span className="text-green-600">
                    ✔ Integration settings saved
                  </span>
                )}
              </div>

              <button
                disabled={erpLoading}
                className="btn-primary px-6 py-2"
              >
                {erpLoading ? "Saving..." : "Save Integration"}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
