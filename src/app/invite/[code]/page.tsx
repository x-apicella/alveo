import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { JoinInvite } from "@/components/JoinInvite";

export default async function InvitePage({ params }: PageProps<"/invite/[code]">) {
  const { code } = await params;
  const user = await getCurrentUser();
  if (!user) redirect(`/login?next=/invite/${code}`);
  return <main className="m-auto max-w-md p-8"><JoinInvite code={code} /></main>;
}
