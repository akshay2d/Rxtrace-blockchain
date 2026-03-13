import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { resolveCompanyForUser } from "@/lib/company/resolve";

type AuthGuardSuccess = {
  userId: string;
};

type AuthCompanyGuardSuccess = {
  userId: string;
  companyId: string;
};

type AuthGuardError = {
  error: NextResponse;
};

export async function requireUserSession(): Promise<AuthGuardSuccess | AuthGuardError> {
  const supabase = await supabaseServer();
  const { data, error } = await supabase.auth.getSession();

  if (error || !data?.session?.user?.id) {
    return {
      error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }

  return {
    userId: data.session.user.id,
  };
}

export async function requireUserSessionWithCompany(): Promise<AuthCompanyGuardSuccess | AuthGuardError> {
  const auth = await requireUserSession();
  if ("error" in auth) {
    return auth;
  }

  const admin = getSupabaseAdmin();
  const resolved = await resolveCompanyForUser(admin, auth.userId, "id");
  if (!resolved?.companyId) {
    return {
      error: NextResponse.json({ error: "Company required" }, { status: 403 }),
    };
  }

  return {
    userId: auth.userId,
    companyId: resolved.companyId,
  };
}
