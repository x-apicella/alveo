import Link from "next/link";
import { Brand } from "./Brand";

export function ServerRail({ servers, activeId }: { servers: { id: string; name: string }[]; activeId?: string }) {
  return <nav className="server-rail" aria-label="Servers">
    <Link href="/" title="Home" className={`rail-icon rail-home ${!activeId ? "is-active" : ""}`}><Brand compact /></Link>
    <div className="rail-divider" />
    {servers.map(server => <Link key={server.id} href={`/s/${server.id}`} title={server.name} aria-label={server.name} aria-current={activeId === server.id ? "page" : undefined} className={`rail-icon ${activeId === server.id ? "is-active" : ""}`}>{server.name.slice(0, 2).toUpperCase()}</Link>)}
    <Link href="/#server-actions" className="rail-icon rail-add" title="Create or join a server" aria-label="Create or join a server">+</Link>
  </nav>;
}
