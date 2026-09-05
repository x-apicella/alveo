import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { joinByInvite } from "@/lib/data";

export default async function InvitePage({ params }: PageProps<"/invite/[code]">) {
  const { code } = await params;
  const user = await getCurrentUser();
  if (!user) redirect(`/login?next=/invite/${code}`);
  const server = await joinByInvite(code, user.id);
  redirect(`/s/${server.id}`);
}
