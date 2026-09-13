export function safeRedirectPath(path: string, origin: string): string {
  if (!path.startsWith("/")) return "/";
  try {
    const destination = new URL(path, origin);
    return destination.origin === origin ? destination.pathname + destination.search + destination.hash : "/";
  } catch {
    return "/";
  }
}
