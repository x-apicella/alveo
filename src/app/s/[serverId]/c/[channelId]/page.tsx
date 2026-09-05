import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { getMemberChannel, listMessages } from "@/lib/data";
import { ChatPanel } from "@/components/ChatPanel";
import { VoiceRoom } from "@/components/VoiceRoom";

export default async function ChannelPage({ params }: PageProps<"/s/[serverId]/c/[channelId]">) {
  const { serverId, channelId } = await params;
  const user = await requireUser();
  const channel = await getMemberChannel(channelId, user.id);
  if (channel.serverId !== serverId) notFound();

  if (channel.kind === "voice") {
    return <VoiceRoom key={channel.id} channel={channel} />;
  }
  const messages = await listMessages(channel.id);
  return (
    <ChatPanel
      key={channel.id}
      channel={channel} initialMessages={messages}
      currentUserId={user.id}
    />
  );
}
