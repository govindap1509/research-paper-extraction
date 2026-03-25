"use client";

import Link from "next/link";
import { Suspense, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

function LoginContent() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(false);
  const search = useSearchParams();
  const nextPath = search.get("next") ?? "/app";
  const message = useMemo(() => {
    const error = search.get("error");
    if (error === "auth-failed") return "Login failed. Please request a new magic link.";
    if (error === "missing-env") return "Supabase environment variables are missing.";
    return "";
  }, [search]);

  async function sendMagicLink() {
    if (!email) {
      setStatus("Please enter your email.");
      return;
    }

    try {
      setLoading(true);
      const supabase = getSupabaseBrowserClient();
      const origin = window.location.origin;
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: {
          emailRedirectTo: `${origin}/auth/callback?next=${encodeURIComponent(nextPath)}`,
        },
      });

      if (error) {
        setStatus(error.message);
        return;
      }

      setStatus("Magic link sent. Please check your email inbox.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="container-width flex flex-1 items-center justify-center py-10">
      <section className="glass-card w-full max-w-xl p-8">
        <span className="chip">Supabase Magic Link</span>
        <h1 className="mt-5 font-mono text-3xl text-(--ink-1)">Researcher Login</h1>
        <p className="mt-3 text-sm leading-7 text-(--ink-2)">
          Sign in using your email. We will send a secure one-time magic link.
        </p>

        <label className="mt-7 block text-sm font-semibold text-(--ink-2)" htmlFor="email">
          Email
        </label>
        <input
          id="email"
          className="mt-2 w-full rounded-xl border border-(--line) bg-white px-4 py-3 text-sm text-(--ink-1) outline-none"
          placeholder="researcher@example.com"
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
        />

        <div className="mt-5 flex flex-wrap gap-3">
          <button className="btn-primary" disabled={loading} onClick={sendMagicLink} type="button">
            {loading ? "Sending..." : "Send Magic Link"}
          </button>
          <Link className="btn-secondary" href="/">
            Back to Home
          </Link>
        </div>

        {message ? <p className="mt-5 text-sm text-red-600">{message}</p> : null}
        {status ? <p className="mt-3 text-sm text-(--ink-2)">{status}</p> : null}
      </section>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<main className="container-width py-10">Loading login...</main>}>
      <LoginContent />
    </Suspense>
  );
}
