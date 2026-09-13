import { NextResponse, type NextRequest } from "next/server";
import { getNeonAuth } from "@/lib/neon-auth";

// Neon exchanges its OAuth verifier for an application-domain session cookie.
// Existing page/API checks continue to support both Neon and D&D sessions.
export async function proxy(request: NextRequest) {
  const auth = getNeonAuth();
  if (!auth) return NextResponse.next();
  return auth.middleware({ loginUrl: "/login" })(request);
}

export const config = {
  matcher: [{
    source: "/((?!api|_next/static|_next/image|favicon.ico).*)",
    has: [{ type: "query", key: "neon_auth_session_verifier" }],
  }],
};
