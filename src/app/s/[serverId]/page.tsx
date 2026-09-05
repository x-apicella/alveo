import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { getMemberServer, listChannels } from "@/lib/data";

/** Landing on a server sends you to its first channel. */
export default async function ServerPage({ params }: PageProps<"/s/[serverId]">) {
  const { serverId } = await params;
  const user = await requireUser();
  await getMemberServer(serverId, user.id);
  const channels = await listChannels(serverId);
  if (channels.length === 0) redirect("/");
  redirect(`/s/${serverId}/c/${channels[0].id}`);
}
