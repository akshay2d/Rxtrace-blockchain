import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

type AuthGuardSuccess = {
  userId: string;
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
