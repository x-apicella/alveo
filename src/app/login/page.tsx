import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { isDevLoginAllowed } from "@/lib/env";
import { DevLoginForm } from "@/components/DevLoginForm";

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  if (await getCurrentUser()) redirect("/");
  const { error } = await searchParams;
  const dndUrl = process.env.DND_APP_LOGIN_URL;

  return (
    <main className="m-auto w-full max-w-sm p-8 flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">Alveo</h1>
        <p className="opacity-60 text-sm">Sign in to join your table.</p>
      </div>
      {error && <p className="text-red-400 text-sm">Sign-in failed. Please try again.</p>}
      {dndUrl && (
        <a href={dndUrl} className="rounded-md bg-accent px-4 py-2 text-center font-medium">
          Continue with your D&amp;D account
        </a>
      )}
      {isDevLoginAllowed() && <DevLoginForm />}
      {!dndUrl && !isDevLoginAllowed() && (
        <p className="text-sm opacity-60">
          No sign-in method is configured. Set DND_APP_LOGIN_URL or ALLOW_DEV_LOGIN.
        </p>
      )}
    </main>
  );
}
