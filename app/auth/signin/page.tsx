'use client';

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import Link from "next/link";
import { supabase } from "@/lib/supabase";

export default function SignIn() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      alert("Wrong email or password");
    setLoading(false);
    } else {
      router.push("/dashboard");
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-900 via-indigo-900 to-blue-900 flex items-center justify-center p-6">
      <Card className="w-full max-w-md bg-white/10 backdrop-blur-xl border-white/20 p-10">
        <h2 className="text-4xl font-bold text-center text-white mb-10">Welcome Back</h2>

        <form onSubmit={handleSignIn} className="space-y-6">
          <div>
            <Label className="text-white">Email</Label>
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@company.com"
              className="bg-white/10 border-white/20 text-white"
              required
            />
          </div>

          <div>
            <Label className="text-white">Password</Label>
            <Input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="bg-white/10 border-white/20 text-white"
              required
            />
          </div>

          <Button
            type="submit"
            disabled={loading}
            className="w-full bg-cyan-400 hover:bg-cyan-300 text-black font-bold text-xl py-8 rounded-xl"
          >
            {loading ? "Signing in..." : "Sign In"}
          </Button>
        </form>

        <p className="text-center text-gray-300 mt-8">
          No account?{" "}
          <Link href="/auth/signup" className="text-cyan-300 hover:underline font-medium">
            Register your company
          </Link>
        </p>
      </Card>
    </div>
  );
}