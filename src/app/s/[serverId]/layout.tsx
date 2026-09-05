import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getMemberServer, listChannels, listServersForUser } from "@/lib/data";
import { ChannelList } from "@/components/ChannelList";

export default async function ServerLayout({ children, params }: LayoutProps<"/s/[serverId]">) {
  const { serverId } = await params;
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const [server, channels, servers] = await Promise.all([
    getMemberServer(serverId, user.id),
    listChannels(serverId),
    listServersForUser(user.id),
  ]);

  return (
    <div className="flex h-full min-h-0">
      <nav className="flex w-16 flex-col items-center gap-2 bg-black/30 py-3">
        <Link href="/" title="Home" className="grid h-12 w-12 place-items-center rounded-2xl bg-panel text-lg">
          A
        </Link>
        {servers.map((s) => (
          <Link
            key={s.id}
            href={`/s/${s.id}`}
            title={s.name}
            className={`grid h-12 w-12 place-items-center rounded-2xl text-sm font-semibold ${
              s.id === server.id ? "bg-accent" : "bg-panel hover:bg-panel-2"
            }`}
          >
            {s.name.slice(0, 2).toUpperCase()}
          </Link>
        ))}
      </nav>
      <aside className="flex w-60 flex-col bg-panel">
        <div className="border-b border-black/30 px-4 py-3 font-semibold">{server.name}</div>
        <ChannelList server={server} channels={channels} />
        <div className="mt-auto border-t border-black/30 px-4 py-3 text-sm opacity-70">
          {user.username}
        </div>
      </aside>
      <section className="flex min-w-0 flex-1 flex-col">{children}</section>
    </div>
  );
}
