import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  try {
    const supabase = await getSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const payload = (await request.json()) as {
      action?: string;
      metadata?: Record<string, unknown>;
    };

    if (!payload.action) {
      return NextResponse.json({ error: "Action is required" }, { status: 400 });
    }

    const { error } = await supabase.from("activity_logs").insert({
      user_id: user.id,
      action: payload.action,
      metadata: payload.metadata ?? {},
    });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unexpected error" },
      { status: 500 }
    );
  }
}
