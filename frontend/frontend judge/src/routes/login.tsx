import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";

import { ErrorBanner } from "@/components/state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuthActions } from "@/lib/auth";

export const Route = createFileRoute("/login")({
  head: () => ({
    meta: [
      { title: "Log in — Verdict" },
      { name: "description", content: "Sign in to judge, submit, or organize on Verdict." },
      { property: "og:title", content: "Log in — Verdict" },
      { property: "og:description", content: "Sign in to judge, submit, or organize on Verdict." },
    ],
  }),
  component: LoginPage,
});

function LoginPage() {
  const { login } = useAuthActions();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<unknown>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);
    try {
      await login(email, password);
      toast.success("Welcome back");
      await router.navigate({ to: "/" });
    } catch (err) {
      setError(err);
    } finally {
      setPending(false);
    }
  }

  return (
    <main className="mx-auto flex w-full max-w-md flex-col justify-center px-5 py-20">
      <div className="panel p-8 animate-rise">
        <p className="eyebrow mb-2">Welcome back</p>
        <h1 className="font-display text-3xl">Log in</h1>
        <form onSubmit={onSubmit} className="mt-6 space-y-4">
          {error ? <ErrorBanner error={error} fallback="We couldn't sign you in." /> : null}
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          <Button type="submit" className="w-full" disabled={pending}>
            {pending ? "Signing in…" : "Log in"}
          </Button>
        </form>
        <p className="mt-6 text-sm text-muted-foreground">
          No account?{" "}
          <Link to="/signup" className="font-medium text-brand hover:underline">
            Sign up
          </Link>
        </p>
      </div>
    </main>
  );
}
