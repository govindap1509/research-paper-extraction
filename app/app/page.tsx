import { redirect } from "next/navigation";
import ToolClient from "@/components/ToolClient";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export default async function ToolPage() {
  const supabase = await getSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  return <ToolClient userId={user.id} userEmail={user.email ?? "researcher"} />;
}
