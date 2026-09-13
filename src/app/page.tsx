import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { listServersForUser } from "@/lib/data";
import { CreateServerForm, JoinServerForm } from "@/components/ServerForms";
import { ServerRail } from "@/components/ServerRail";
import { Brand } from "@/components/Brand";

export default async function Home() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const servers = await listServersForUser(user.id);
  return <main className="app-shell">
    <ServerRail servers={servers} />
    <div className="home-content">
      <header className="channel-heading justify-between"><Brand /><form action="/api/auth/logout" method="post" className="flex items-center gap-4 text-xs"><span className="text-gray-400">{user.username}</span><button type="submit" className="hover:text-accent">Sign out</button></form></header>
      <div className="home-inner">
        <section className="home-hero honeycomb"><h1>Join the Hive</h1></section>
        <section className="mb-8"><div className="mb-4 flex items-center justify-between"><h2 className="text-sm font-semibold">Your servers</h2><span className="text-xs text-gray-400">{servers.length} {servers.length === 1 ? "server" : "servers"}</span></div>
          {servers.length === 0 && <p className="rounded-lg border border-dashed border-white/10 p-6 text-sm text-gray-400">Your next hangout is one click away. Create a server or join your friends below.</p>}
          <ul className="grid gap-3 sm:grid-cols-2">{servers.map(s => <li key={s.id}><Link href={`/s/${s.id}`} className="server-card"><span className="avatar">{s.name.slice(0, 2).toUpperCase()}</span><span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold">{s.name}</span><span className="text-xs text-gray-400">Open server</span></span><span className="text-accent" aria-hidden="true">→</span></Link></li>)}</ul>
        </section>
        <section id="server-actions" className="grid gap-4 sm:grid-cols-2"><CreateServerForm /><JoinServerForm /></section>
        <Link href="/privacy" className="mt-6 inline-block text-sm underline opacity-70">Privacy policy</Link>
      </div>
    </div>
  </main>;
}
