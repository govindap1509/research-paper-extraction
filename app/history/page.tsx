import Link from "next/link";
import { redirect } from "next/navigation";
import { getSupabaseServerClient } from "@/lib/supabase/server";

type ActivityLog = {
  id: string;
  action: string;
  metadata: Record<string, unknown> | null;
  created_at: string;
};

export default async function HistoryPage() {
  const supabase = await getSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data } = await supabase
    .from("activity_logs")
    .select("id, action, metadata, created_at")
    .order("created_at", { ascending: false })
    .limit(200);

  const logs = (data ?? []) as ActivityLog[];

  return (
    <main className="container-width flex flex-1 flex-col gap-6 py-10">
      <header className="glass-card flex items-center justify-between p-6">
        <div>
          <h1 className="font-mono text-2xl text-(--ink-1)">Activity History</h1>
          <p className="mt-1 text-sm text-(--ink-2)">
            Login/logout events and researcher actions are stored here.
          </p>
        </div>
        <Link className="btn-secondary" href="/app">
          Back to Workspace
        </Link>
      </header>

      <section className="glass-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="bg-(--surface-soft)">
              <tr>
                <th className="px-4 py-3 font-semibold text-(--ink-2)">Action</th>
                <th className="px-4 py-3 font-semibold text-(--ink-2)">Metadata</th>
                <th className="px-4 py-3 font-semibold text-(--ink-2)">When</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((log) => (
                <tr key={log.id} className="border-t border-(--line)">
                  <td className="px-4 py-3 text-(--ink-1)">{log.action}</td>
                  <td className="px-4 py-3 text-(--ink-2)">
                    <pre className="whitespace-pre-wrap text-xs">
                      {JSON.stringify(log.metadata ?? {}, null, 2)}
                    </pre>
                  </td>
                  <td className="px-4 py-3 text-(--ink-2)">
                    {new Date(log.created_at).toLocaleString()}
                  </td>
                </tr>
              ))}
              {logs.length === 0 ? (
                <tr>
                  <td className="px-4 py-8 text-(--ink-2)" colSpan={3}>
                    No logs recorded yet.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
