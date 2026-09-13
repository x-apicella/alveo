import { ServerRail } from "@/components/ServerRail";
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
    <div className="app-shell">
      <ServerRail servers={servers} activeId={server.id} />
      <aside className="channel-sidebar">
        <div className="server-heading"><span className="truncate">{server.name}</span><span aria-hidden="true" className="text-accent">⌄</span></div>
        <div className="server-banner honeycomb"><span className="eyebrow">Join the Hive</span></div>
        <ChannelList server={server} channels={channels} />
        <div className="user-panel"><span className="avatar">{user.username.slice(0, 2).toUpperCase()}</span><div className="min-w-0"><div className="user-name">{user.username}</div><div className="user-caption">Your personal space</div></div></div>
      </aside>
      <section className="flex min-w-0 flex-1 flex-col">{children}</section>
    </div>
  );
}
