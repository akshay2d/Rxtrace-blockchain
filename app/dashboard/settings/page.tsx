"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
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
  profile_completed?: boolean | null;
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
  // Removed ERP integration state - now handled in dedicated page

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
          .select('id, company_name, pan, gst, address, email, user_id, profile_completed')
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

  // Removed handleErpSave - ERP integration now handled in dedicated page

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

      {/* Company Setup Link - Always visible in Settings */}
      <div className="bg-blue-50 border-2 border-blue-200 rounded-2xl p-6">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <h3 className="text-lg font-semibold text-blue-900 mb-2">
              Company Setup
            </h3>
            <p className="text-sm text-blue-800 mb-4">
              {companyProfile?.profile_completed 
                ? 'Update your company setup information or view current details.'
                : 'Company setup is required to use RxTrace features. Complete your company information to continue.'}
            </p>
            <a
              href="/dashboard/company-setup"
              className="inline-block px-6 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors"
            >
              {companyProfile?.profile_completed ? 'Edit Company Setup →' : 'Complete Company Setup →'}
            </a>
          </div>
        </div>
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

      {/* Tax Profile Section (Optional, Separate) */}
      <div className="bg-white border border-gray-200 rounded-2xl shadow-sm">
        <div className="p-8 space-y-6">
          <div>
            <h2 className="text-xl font-medium">Tax Profile</h2>
            <p className="text-sm text-gray-500 mt-1">
              Tax information is optional and used only for billing and GST reports. Not required for code generation.
            </p>
          </div>

          {companyLoading ? (
            <div className="p-4 text-gray-500">Loading tax profile...</div>
          ) : companyProfile ? (
            <form onSubmit={handleCompanyProfileSave} className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* PAN Number (Optional) */}
              <div>
                <label className="label">PAN Number (Optional)</label>
                <input
                  type="text"
                  className="input"
                  value={companyFormData.pan}
                  onChange={(e) => setCompanyFormData({ ...companyFormData, pan: e.target.value.toUpperCase() })}
                  placeholder="Enter PAN number"
                  maxLength={10}
                />
                <p className="text-xs text-gray-500 mt-1">Used for billing and tax reports</p>
              </div>

              {/* GST Number (Optional) */}
              <div>
                <label className="label">GST Number (Optional)</label>
                <input
                  type="text"
                  className="input"
                  value={companyFormData.gst}
                  onChange={(e) => setCompanyFormData({ ...companyFormData, gst: e.target.value.toUpperCase() })}
                  placeholder="Enter GST number"
                  maxLength={15}
                />
                <p className="text-xs text-gray-500 mt-1">Used for GST reports and compliance</p>
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
              <div className="md:col-span-2 flex items-center justify-end pt-4 border-t">
                <button
                  type="submit"
                  disabled={companySaving}
                  className="btn-primary px-6 py-2"
                >
                  {companySaving ? "Saving..." : "Save Tax Profile"}
                </button>
              </div>
            </form>
          ) : (
            <div className="p-4 text-gray-500">Please complete company setup first to access tax profile.</div>
          )}
        </div>
      </div>

      {/* Printer Integration Section */}
      <div className="bg-white border border-gray-200 rounded-2xl shadow-sm">
        <div className="p-8 space-y-6">
          <div>
            <h2 className="text-xl font-medium">Printer Integration</h2>
            <p className="text-sm text-gray-500 mt-1">
              Configure printer preferences for label printing. Settings are optional and only used when printing.
            </p>
          </div>

          {companyLoading ? (
            <div className="p-4 text-gray-500">Loading printer settings...</div>
          ) : companyProfile ? (
            <PrinterIntegrationForm companyId={companyProfile.id} />
          ) : (
            <div className="p-4 text-gray-500">Please complete company setup first to access printer settings.</div>
          )}
        </div>
      </div>

      {/* ERP Integration Section */}
      <div className="bg-white border border-gray-200 rounded-2xl shadow-sm">
        <div className="p-8 space-y-6">
          <div>
            <h2 className="text-xl font-medium">
              ERP Integration
            </h2>
            <p className="text-sm text-gray-500 mt-1">
              Configure ERP code ingestion methods and import ERP-generated serialization data into RxTrace.
            </p>
          </div>

          <div className="bg-blue-50 border border-blue-200 rounded-lg p-6">
            <h3 className="text-sm font-semibold text-gray-900 mb-2">ERP Code Ingestion</h3>
            <p className="text-sm text-gray-700 mb-4">
              RxTrace supports importing codes generated by your ERP system. Configure ingestion methods and manage imports from the dedicated ERP Integration page.
            </p>
            <Link 
              href="/dashboard/settings/erp-integration"
              className="inline-flex items-center px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition text-sm font-medium"
            >
              Configure ERP Integration →
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

// Printer Integration Form Component
function PrinterIntegrationForm({ companyId }: { companyId: string }) {
  const [printFormat, setPrintFormat] = useState<'PDF' | 'EPL' | 'ZPL'>('PDF');
  const [printerType, setPrinterType] = useState<'thermal' | 'laser' | 'generic'>('thermal');
  const [printerIdentifier, setPrinterIdentifier] = useState('');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    // Load saved preferences
    async function loadPreferences() {
      try {
        const res = await fetch(`/api/companies/${companyId}/printer-settings`);
        if (res.ok) {
          const data = await res.json();
          if (data.print_format) setPrintFormat(data.print_format);
          if (data.printer_type) setPrinterType(data.printer_type);
          if (data.printer_identifier) setPrinterIdentifier(data.printer_identifier);
        }
      } catch {
        // Ignore - use defaults
      }
    }
    loadPreferences();
  }, [companyId]);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setMessage(null);

    try {
      const res = await fetch(`/api/companies/${companyId}/printer-settings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          print_format: printFormat,
          printer_type: printerType,
          printer_identifier: printerIdentifier.trim() || null,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to save printer settings');

      setMessage({ type: 'success', text: 'Printer settings saved successfully' });
      setTimeout(() => setMessage(null), 3000);
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || 'Failed to save printer settings' });
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSave} className="space-y-6">
      {/* Print Format */}
      <div>
        <label className="label">Preferred Print Format *</label>
        <select
          value={printFormat}
          onChange={(e) => setPrintFormat(e.target.value as 'PDF' | 'EPL' | 'ZPL')}
          className="input"
          required
        >
          <option value="PDF">PDF (Opens OS print dialog)</option>
          <option value="EPL">EPL (Raw file output)</option>
          <option value="ZPL">ZPL (Raw file output)</option>
        </select>
        <p className="text-xs text-gray-500 mt-1">
          {printFormat === 'PDF' 
            ? 'PDF opens in a new tab and triggers the OS print dialog.' 
            : `${printFormat} files will be downloaded for manual printing.`}
        </p>
      </div>

      {/* Printer Type */}
      <div>
        <label className="label">Printer Type</label>
        <select
          value={printerType}
          onChange={(e) => setPrinterType(e.target.value as 'thermal' | 'laser' | 'generic')}
          className="input"
        >
          <option value="thermal">Thermal</option>
          <option value="laser">Laser / Inkjet</option>
          <option value="generic">Generic</option>
        </select>
        <p className="text-xs text-gray-500 mt-1">Used for print logs and future optimization.</p>
      </div>

      {/* Printer Identifier */}
      <div>
        <label className="label">Printer Identifier (Optional)</label>
        <input
          type="text"
          value={printerIdentifier}
          onChange={(e) => setPrinterIdentifier(e.target.value)}
          placeholder="e.g., Zebra-GK420T, Warehouse-01"
          className="input"
          maxLength={100}
        />
        <p className="text-xs text-gray-500 mt-1">
          User-defined name for your printer. Used only for UI clarity and print logs.
        </p>
      </div>

      {message && (
        <div className={`p-3 rounded-lg text-sm ${
          message.type === 'success' 
            ? 'bg-green-50 text-green-800 border border-green-200' 
            : 'bg-red-50 text-red-800 border border-red-200'
        }`}>
          {message.text}
        </div>
      )}

      <div className="flex justify-end pt-4 border-t">
        <button
          type="submit"
          disabled={saving}
          className="btn-primary px-6 py-2"
        >
          {saving ? 'Saving...' : 'Save Printer Settings'}
        </button>
      </div>
    </form>
  );
}
