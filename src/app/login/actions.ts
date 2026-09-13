"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { getNeonAuth } from "@/lib/neon-auth";

const credentials = z.object({
  email: z.email(),
  password: z.string().min(8).max(128),
  mode: z.enum(["sign-in", "sign-up"]),
  name: z.string().trim().max(64),
});

export async function neonLogin(_state: { error: string }, form: FormData) {
  const input = credentials.safeParse(Object.fromEntries(form));
  if (!input.success) return { error: "Enter a valid email and a password of 8–128 characters." };
  const auth = getNeonAuth();
  if (!auth) return { error: "Email sign-in is unavailable." };
  const { mode, name, email, password } = input.data;
  if (mode === "sign-up" && !name) return { error: "Enter your display name." };
  try {
    const result = mode === "sign-up"
      ? await auth.signUp.email({ name, email, password })
      : await auth.signIn.email({ email, password });
    if (result.error) return { error: mode === "sign-up"
      ? "Could not create your account. Check your details or try signing in."
      : "Could not sign in. Check your email, password, and email verification." };
    const session = await auth.getSession();
    if (!session.data?.user) return { error: "Check your email to verify your account, then sign in." };
  } catch {
    return { error: "Sign-in is temporarily unavailable. Please try again." };
  }
  redirect("/");
}
