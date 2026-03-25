import { NextResponse } from "next/server";
import JSZip from "jszip";
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

    const { paperId } = (await request.json()) as { paperId?: string };

    if (!paperId) {
      return NextResponse.json({ error: "paperId is required" }, { status: 400 });
    }

    const { data: paper, error: paperError } = await supabase
      .from("papers")
      .select("id, title, extracted_text")
      .eq("id", paperId)
      .single();

    if (paperError || !paper) {
      return NextResponse.json({ error: paperError?.message ?? "Paper not found" }, { status: 404 });
    }

    const { data: tables } = await supabase
      .from("paper_tables")
      .select("table_index, title, headers, rows, footnote")
      .eq("paper_id", paperId)
      .order("table_index", { ascending: true });

    const { data: figures } = await supabase
      .from("paper_figures")
      .select("figure_index, label, caption, description, figure_type, storage_path")
      .eq("paper_id", paperId)
      .order("figure_index", { ascending: true });

    const zip = new JSZip();
    const safeName = (paper.title ?? "paper").replace(/[^a-zA-Z0-9-_]+/g, "_");

    zip.file(`${safeName}/text.txt`, paper.extracted_text ?? "");
    zip.file(`${safeName}/tables.json`, JSON.stringify(tables ?? [], null, 2));
    zip.file(`${safeName}/figures.json`, JSON.stringify(figures ?? [], null, 2));

    // Download actual figure images from Supabase Storage and add to zip
    if (figures && figures.length > 0) {
      for (const fig of figures) {
        const storagePath = (fig as { storage_path?: string }).storage_path;
        if (!storagePath) continue;
        const { data: fileData } = await supabase.storage
          .from("paper-figures")
          .download(storagePath);
        if (fileData) {
          const ext = storagePath.split(".").pop() ?? "png";
          const buffer = await fileData.arrayBuffer();
          zip.file(`${safeName}/figures/figure_${(fig as { figure_index?: number }).figure_index ?? 0}.${ext}`, buffer);
        }
      }
    }

    await supabase.from("activity_logs").insert({
      user_id: user.id,
      action: "download",
      metadata: { paperId },
    });

    const binary = await zip.generateAsync({ type: "arraybuffer" });
    const blob = new Blob([binary], { type: "application/zip" });
    return new NextResponse(blob, {
      status: 200,
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="${safeName}.zip"`,
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unexpected error" },
      { status: 500 }
    );
  }
}
