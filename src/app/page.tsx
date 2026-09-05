import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { listServersForUser } from "@/lib/data";
import { CreateServerForm, JoinServerForm } from "@/components/ServerForms";

export default async function Home() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const servers = await listServersForUser(user.id);

  return (
    <main className="mx-auto w-full max-w-2xl p-8 flex flex-col gap-8 overflow-y-auto">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Alveo</h1>
        <form action="/api/auth/logout" method="post" className="text-sm opacity-70">
          <span className="mr-3">{user.username}</span>
          <button className="underline" type="submit">
            Sign out
          </button>
        </form>
      </header>

      <section className="flex flex-col gap-2">
        <h2 className="text-sm uppercase tracking-wide opacity-60">Your servers</h2>
        {servers.length === 0 && <p className="opacity-60">No servers yet. Create one below.</p>}
        <ul className="flex flex-col gap-2">
          {servers.map((s) => (
            <li key={s.id}>
              <Link
                href={`/s/${s.id}`}
                className="block rounded-lg bg-panel px-4 py-3 hover:bg-panel-2"
              >
                {s.name}
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <section className="grid gap-6 sm:grid-cols-2">
        <CreateServerForm />
        <JoinServerForm />
      </section>
    </main>
  );
}
