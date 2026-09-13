import { Brand } from "@/components/Brand";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { isDevLoginAllowed } from "@/lib/env";
import { DevLoginForm } from "@/components/DevLoginForm";
import { GoogleLoginButton } from "@/components/GoogleLoginButton";
import { NeonLoginForm } from "@/components/NeonLoginForm";

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  if (await getCurrentUser()) redirect("/");
  const { error, next } = await searchParams;
  const dndUrl = process.env.DND_APP_LOGIN_URL;

  return (
    <main className="login-screen honeycomb"><div className="login-card">
      <div>
        <Brand /><h1 className="mt-6 text-2xl font-semibold tracking-tight">Join the Hive</h1>
      </div>
      {error && <p className="text-red-400 text-sm">Sign-in failed. Please try again.</p>}
      {process.env.NEON_AUTH_URL && (
        <>
          <GoogleLoginButton next={typeof next === "string" ? next : "/"} />
          <NeonLoginForm />
        </>
      )}
      {dndUrl && (
        <a href={dndUrl} className="rounded-md bg-accent px-4 py-2 text-center font-medium">
          Continue with your D&amp;D account
        </a>
      )}
      {isDevLoginAllowed() && <DevLoginForm />}
      {!dndUrl && !process.env.NEON_AUTH_URL && !isDevLoginAllowed() && (
        <p className="text-sm opacity-60">
          No sign-in method is configured. Set DND_APP_LOGIN_URL or ALLOW_DEV_LOGIN.
        </p>
      )}
      <Link href="/privacy" className="text-center text-sm underline opacity-70">Privacy policy</Link>
    </div></main>
  );
}
