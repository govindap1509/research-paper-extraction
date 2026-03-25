"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

type Paper = {
  id: string;
  title: string;
  status: "queued" | "processing" | "done" | "error";
  extracted_text: string | null;
  created_at?: string;
};

type TableRecord = {
  table_index: number;
  title: string;
  headers: string[];
  rows: string[][];
  footnote: string | null;
};

type FigureRecord = {
  figure_index: number;
  label: string;
  caption: string;
  description: string;
  figure_type: string;
  storage_path: string | null;
};

type Props = {
  userId: string;
  userEmail: string;
};

export default function ToolClient({ userId, userEmail }: Props) {
  const [title, setTitle] = useState("");
  const [authors, setAuthors] = useState("");
  const [journal, setJournal] = useState("");
  const [doi, setDoi] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("Upload a paper and start extraction.");

  const [currentPaper, setCurrentPaper] = useState<Paper | null>(null);
  const [textResult, setTextResult] = useState("");
  const [tables, setTables] = useState<TableRecord[]>([]);
  const [figures, setFigures] = useState<FigureRecord[]>([]);
  const [figureUrls, setFigureUrls] = useState<Record<number, string>>({});
  const [liveStatus, setLiveStatus] = useState<Paper["status"] | null>(null);
  const [queueDepth, setQueueDepth] = useState<number | null>(null);
  const [pastPapers, setPastPapers] = useState<Paper[]>([]);
  const [loadingPaper, setLoadingPaper] = useState(false);

  const disableExtract = useMemo(() => !file || !title || busy, [file, title, busy]);

  const extractTooltip = !file ? "Upload a PDF first" : !title ? "Enter a paper title first" : undefined;

  const progressPercent = useMemo(() => {
    if (liveStatus === "done") return 100;
    if (liveStatus === "processing") return 66;
    if (liveStatus === "queued") return 33;
    if (liveStatus === "error") return 100;
    return 0;
  }, [liveStatus]);

  const progressLabel = useMemo(() => {
    if (liveStatus === "done") return "Completed";
    if (liveStatus === "processing") return "Processing";
    if (liveStatus === "queued") return "Queued";
    if (liveStatus === "error") return "Failed";
    return "Not started";
  }, [liveStatus]);

  // Load past papers on mount
  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    supabase
      .from("papers")
      .select("id, title, status, extracted_text, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(20)
      .then(({ data }) => {
        if (data) setPastPapers(data as Paper[]);
      });
  }, [userId]);

  // Load a previously extracted paper
  async function loadPaper(paper: Paper) {
    setLoadingPaper(true);
    setCurrentPaper(paper);
    setLiveStatus(paper.status);
    setTextResult(paper.extracted_text ?? "");
    setTitle(paper.title);

    const supabase = getSupabaseBrowserClient();

    const { data: tableData } = await supabase
      .from("paper_tables")
      .select("table_index, title, headers, rows, footnote")
      .eq("paper_id", paper.id)
      .order("table_index", { ascending: true });

    setTables((tableData ?? []) as TableRecord[]);

    const { data: figureData } = await supabase
      .from("paper_figures")
      .select("figure_index, label, caption, description, figure_type, storage_path")
      .eq("paper_id", paper.id)
      .order("figure_index", { ascending: true });

    setFigures((figureData ?? []) as FigureRecord[]);
    setStatus(paper.status === "done" ? "Loaded from history." : `Status: ${paper.status}`);
    setLoadingPaper(false);
  }

  useEffect(() => {
    if (!currentPaper) {
      return;
    }

    const paperId = currentPaper.id;
    const paperCreatedAt = currentPaper.created_at;
    const supabase = getSupabaseBrowserClient();
    let cancelled = false;

    async function refreshStatus() {
      const { data, error } = await supabase
        .from("papers")
        .select("status")
        .eq("id", paperId)
        .single();

      if (!error && data && !cancelled) {
        setLiveStatus(data.status as Paper["status"]);
      }

      if (cancelled || !paperCreatedAt) {
        return;
      }

      const { count } = await supabase
        .from("papers")
        .select("id", { count: "exact", head: true })
        .in("status", ["queued", "processing"])
        .lte("created_at", paperCreatedAt);

      if (!cancelled) {
        setQueueDepth(count ? Math.max(0, count - 1) : 0);
      }
    }

    void refreshStatus();
    const interval = window.setInterval(() => {
      void refreshStatus();
    }, 2500);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [currentPaper]);

  async function insertLog(action: string, metadata: Record<string, unknown> = {}) {
    await fetch("/api/log", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, metadata }),
    });
  }

  async function handleLogout() {
    const supabase = getSupabaseBrowserClient();
    await insertLog("logout", { userEmail });
    await supabase.auth.signOut();
    window.location.href = "/login";
  }

  async function runExtraction() {
    if (!file || !title) {
      setStatus("Title and PDF are required.");
      return;
    }

    setBusy(true);
    setStatus("Queued for extraction...");
    setLiveStatus("queued");
    setQueueDepth(null);

    const supabase = getSupabaseBrowserClient();

    const { data: paper, error: createError } = await supabase
      .from("papers")
      .insert({
        user_id: userId,
        title,
        authors,
        journal,
        doi,
        status: "queued",
      })
      .select("id, title, status, extracted_text, created_at")
      .single();

    if (createError || !paper) {
      setBusy(false);
      setStatus(createError?.message ?? "Failed to queue extraction.");
      return;
    }

    setCurrentPaper(paper as Paper);
    setPastPapers((prev) => [paper as Paper, ...prev]);
    await insertLog("upload", { paperId: paper.id, filename: file.name });

    // Upload PDF to Supabase Storage to avoid Vercel's 4.5 MB function payload limit
    const storagePath = `${userId}/${paper.id}/original.pdf`;
    const { error: uploadError } = await supabase.storage
      .from("paper-pdfs")
      .upload(storagePath, file, { contentType: "application/pdf", upsert: true });

    if (uploadError) {
      await supabase.from("papers").update({ status: "error" }).eq("id", paper.id);
      setBusy(false);
      setStatus(`Upload failed: ${uploadError.message}`);
      setLiveStatus("error");
      return;
    }

    const { data: signedUrlData, error: signedUrlError } = await supabase.storage
      .from("paper-pdfs")
      .createSignedUrl(storagePath, 300); // 5 minutes

    if (signedUrlError || !signedUrlData?.signedUrl) {
      await supabase.from("papers").update({ status: "error" }).eq("id", paper.id);
      setBusy(false);
      setStatus("Failed to generate download URL for extraction.");
      setLiveStatus("error");
      return;
    }

    await supabase.from("papers").update({ status: "processing" }).eq("id", paper.id);
    setStatus("Processing extraction...");
    setLiveStatus("processing");

    try {
      const response = await fetch("/api/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ signed_url: signedUrlData.signedUrl }),
      });
      const rawText = await response.text();
      let payload: {
        text?: string;
        tables?: Array<{
          title?: string;
          headers?: string[];
          rows?: string[][];
          footnote?: string;
        }>;
        figures?: Array<{
          label?: string;
          caption?: string;
          description?: string;
          type?: string;
          image_b64?: string;
        }>;
        error?: string;
      } = {};
      try {
        payload = JSON.parse(rawText) as typeof payload;
      } catch {
        throw new Error(`Extraction API error (${response.status}): ${rawText.slice(0, 300)}`);
      }

      if (!response.ok) {
        throw new Error(payload.error ?? `Extraction failed (HTTP ${response.status})`);
      }

      const extractedText = payload.text ?? "";
      const extractedTables = payload.tables ?? [];
      const extractedFigures = payload.figures ?? [];

      await supabase
        .from("papers")
        .update({ status: "done", extracted_text: extractedText })
        .eq("id", paper.id);
      setLiveStatus("done");
      setQueueDepth(0);

      if (extractedTables.length > 0) {
        await supabase.from("paper_tables").insert(
          extractedTables.map((table, index) => ({
            paper_id: paper.id,
            table_index: index + 1,
            title: table.title ?? `Table ${index + 1}`,
            headers: table.headers ?? [],
            rows: table.rows ?? [],
            footnote: table.footnote ?? null,
          }))
        );
      }

      if (extractedFigures.length > 0) {
        const rows: Omit<FigureRecord, "figure_index">[] = [];

        for (let index = 0; index < extractedFigures.length; index += 1) {
          const figure = extractedFigures[index];
          let storagePath: string | null = null;

          if (figure.image_b64) {
            const byteString = atob(figure.image_b64);
            const bytes = new Uint8Array(byteString.length);
            for (let i = 0; i < byteString.length; i += 1) {
              bytes[i] = byteString.charCodeAt(i);
            }

            storagePath = `${paper.id}/figure_${index + 1}.png`;
            await supabase.storage.from("paper-figures").upload(storagePath, bytes, {
              contentType: "image/png",
              upsert: true,
            });
          }

          rows.push({
            label: figure.label ?? `Figure ${index + 1}`,
            caption: figure.caption ?? "",
            description: figure.description ?? "",
            figure_type: figure.type ?? "other",
            storage_path: storagePath,
          });
        }

        await supabase.from("paper_figures").insert(
          rows.map((row, index) => ({
            paper_id: paper.id,
            figure_index: index + 1,
            ...row,
          }))
        );
      }

      await insertLog("extract", {
        paperId: paper.id,
        tables: extractedTables.length,
        figures: extractedFigures.length,
      });

      setTextResult(extractedText);
      setTables(
        extractedTables.map((table, index) => ({
          table_index: index + 1,
          title: table.title ?? `Table ${index + 1}`,
          headers: table.headers ?? [],
          rows: table.rows ?? [],
          footnote: table.footnote ?? null,
        }))
      );
      setFigures(
        extractedFigures.map((figure, index) => ({
          figure_index: index + 1,
          label: figure.label ?? `Figure ${index + 1}`,
          caption: figure.caption ?? "",
          description: figure.description ?? "",
          figure_type: figure.type ?? "other",
          storage_path: figure.image_b64 ? `${paper.id}/figure_${index + 1}.png` : null,
        }))
      );
      setStatus("Extraction complete.");
    } catch (error) {
      await supabase.from("papers").update({ status: "error" }).eq("id", paper.id);
      setLiveStatus("error");
      setStatus(error instanceof Error ? error.message : "Extraction failed.");
    } finally {
      setBusy(false);
    }
  }

  // Load signed URLs for figures stored in Supabase Storage
  const loadFigureUrls = useCallback(async (figs: FigureRecord[]) => {
    const supabase = getSupabaseBrowserClient();
    const urls: Record<number, string> = {};
    for (const fig of figs) {
      if (!fig.storage_path) continue;
      const { data } = await supabase.storage
        .from("paper-figures")
        .createSignedUrl(fig.storage_path, 3600);
      if (data?.signedUrl) {
        urls[fig.figure_index] = data.signedUrl;
      }
    }
    setFigureUrls(urls);
  }, []);

  useEffect(() => {
    if (figures.length > 0 && figures.some((f) => f.storage_path)) {
      void loadFigureUrls(figures);
    }
  }, [figures, loadFigureUrls]);

  // Show a hint when file is selected but title is missing
  useEffect(() => {
    if (file && !title && !busy && !currentPaper) {
      setStatus("Enter a paper title to enable extraction.");
    } else if (!file && !currentPaper && !busy) {
      setStatus("Upload a paper and start extraction.");
    }
  }, [file, title, busy, currentPaper]);

  function resetExtraction() {
    setCurrentPaper(null);
    setTextResult("");
    setTables([]);
    setFigures([]);
    setFigureUrls({});
    setLiveStatus(null);
    setQueueDepth(null);
    setStatus("Upload a paper and start extraction.");
    setFile(null);
    setTitle("");
    setAuthors("");
    setJournal("");
    setDoi("");
  }

  async function downloadAll() {
    if (!currentPaper) return;

    const response = await fetch("/api/download", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ paperId: currentPaper.id }),
    });

    if (!response.ok) {
      setStatus("Failed to generate zip download.");
      return;
    }

    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${(currentPaper.title ?? "paper").replace(/[^a-zA-Z0-9-_]+/g, "_")}.zip`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  return (
    <main className="container-width flex flex-1 flex-col gap-6 py-8">
      <header className="glass-card flex flex-wrap items-center justify-between gap-3 p-6">
        <div>
          <h1 className="font-mono text-2xl text-(--ink-1)">Research Extraction Tool</h1>
          <p className="mt-1 text-sm text-(--ink-2)">Logged in as {userEmail}</p>
        </div>
        <div className="flex flex-wrap gap-3">
          <Link className="btn-secondary" href="/history">
            View Activity Logs
          </Link>
          <button className="btn-secondary" onClick={handleLogout} type="button">
            Logout
          </button>
        </div>
      </header>

      {/* Past papers sidebar */}
      {pastPapers.length > 0 && (
        <section className="glass-card p-4">
          <h2 className="font-mono text-sm font-semibold text-(--ink-1)">Past Extractions</h2>
          <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
            {pastPapers.map((p) => (
              <button
                key={p.id}
                type="button"
                disabled={loadingPaper || busy}
                onClick={() => void loadPaper(p)}
                className={`shrink-0 rounded-xl border px-3 py-2 text-left text-xs transition-colors ${
                  currentPaper?.id === p.id
                    ? "border-(--brand-blue) bg-blue-50 text-(--brand-blue)"
                    : "border-(--line) bg-white text-(--ink-2) hover:border-(--brand-blue)"
                }`}
              >
                <span className="block max-w-[180px] truncate font-semibold">{p.title}</span>
                <span className="mt-0.5 block text-[10px] opacity-70">
                  {p.status === "done" ? "Completed" : p.status === "error" ? "Failed" : p.status}
                  {p.created_at ? " · " + new Date(p.created_at).toLocaleDateString() : ""}
                </span>
              </button>
            ))}
          </div>
        </section>
      )}

      <section className="glass-card p-6">
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <label className="text-sm font-semibold text-(--ink-2)">Paper title *</label>
            <input
              className="mt-2 w-full rounded-xl border border-(--line) bg-white px-4 py-3 text-sm text-(--ink-1)"
              placeholder="Full paper title"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
            />
          </div>
          <div>
            <label className="text-sm font-semibold text-(--ink-2)">Authors</label>
            <input
              className="mt-2 w-full rounded-xl border border-(--line) bg-white px-4 py-3 text-sm text-(--ink-1)"
              placeholder="Author A, Author B"
              value={authors}
              onChange={(event) => setAuthors(event.target.value)}
            />
          </div>
          <div>
            <label className="text-sm font-semibold text-(--ink-2)">Journal</label>
            <input
              className="mt-2 w-full rounded-xl border border-(--line) bg-white px-4 py-3 text-sm text-(--ink-1)"
              placeholder="Journal name + year"
              value={journal}
              onChange={(event) => setJournal(event.target.value)}
            />
          </div>
          <div>
            <label className="text-sm font-semibold text-(--ink-2)">DOI</label>
            <input
              className="mt-2 w-full rounded-xl border border-(--line) bg-white px-4 py-3 text-sm text-(--ink-1)"
              placeholder="10.xxxx/..."
              value={doi}
              onChange={(event) => setDoi(event.target.value)}
            />
          </div>
        </div>

        <div className="mt-5 rounded-2xl border border-dashed border-(--line) bg-(--surface-soft) p-6">
          <label className="text-sm font-semibold text-(--ink-2)">Upload PDF</label>
          <input
            accept=".pdf"
            className="mt-2 w-full text-sm text-(--ink-2)"
            onChange={(event) => setFile(event.target.files?.[0] ?? null)}
            type="file"
          />
          <p className="mt-2 text-xs text-(--ink-3)">Text, tables, and figures will be extracted and stored in Supabase.</p>
        </div>

        <div className="mt-5 flex flex-wrap items-center gap-3">
          <button className="btn-primary" disabled={disableExtract} onClick={runExtraction} title={extractTooltip} type="button">
            {busy ? "Processing..." : "Extract Key Details"}
          </button>
          <button className="btn-secondary" disabled={!currentPaper || busy} onClick={downloadAll} type="button">
            Download All Data
          </button>
          {liveStatus === "error" && (
            <button className="btn-secondary" onClick={resetExtraction} type="button">
              Reset &amp; Try Again
            </button>
          )}
          {liveStatus === "done" && (
            <button className="btn-secondary" onClick={resetExtraction} type="button">
              New Extraction
            </button>
          )}
          <span className="text-sm text-(--ink-2)">{status}</span>
        </div>

        <div className="mt-5 rounded-2xl border border-(--line) bg-white p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-mono text-sm text-(--ink-1)">Queue and Progress</h2>
            <span className="text-xs font-semibold text-(--ink-2)">{progressLabel}</span>
          </div>
          <div className="mt-3 h-2 w-full rounded-full bg-(--surface-soft)">
            <div
              className="h-2 rounded-full bg-(--brand-blue) transition-all"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
          <div className="mt-3 grid gap-2 text-xs text-(--ink-2) md:grid-cols-3">
            <p>Queued: {liveStatus === "queued" || liveStatus === "processing" || liveStatus === "done" ? "Yes" : "No"}</p>
            <p>In front of you: {queueDepth ?? "-"}</p>
            <p>Current paper: {currentPaper?.title ?? "Not selected"}</p>
          </div>
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-3">
        <article className="glass-card overflow-hidden">
          <header className="border-b border-(--line) bg-(--surface-soft) px-4 py-3 font-mono text-sm text-(--ink-1)">
            Extracted Text
          </header>
          <div className="max-h-[420px] overflow-auto p-4 text-sm leading-7 text-(--ink-2)">
            {textResult || "No extracted text yet."}
          </div>
        </article>

        <article className="glass-card overflow-hidden">
          <header className="border-b border-(--line) bg-(--surface-soft) px-4 py-3 font-mono text-sm text-(--ink-1)">
            Tables ({tables.length})
          </header>
          <div className="max-h-[420px] space-y-4 overflow-auto p-4 text-sm text-(--ink-2)">
            {tables.length === 0 ? "No tables yet." : null}
            {tables.map((table) => (
              <div className="rounded-xl border border-(--line) p-3" key={table.table_index}>
                <h3 className="font-semibold text-(--ink-1)">{table.title}</h3>
                <p className="mt-1 text-xs text-(--ink-3)">{table.rows.length} rows · {table.headers.length} columns</p>
                {table.headers.length > 0 && (
                  <div className="mt-2 overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b border-(--line)">
                          {table.headers.map((h, i) => (
                            <th key={i} className="px-2 py-1 text-left font-semibold text-(--ink-1)">{h || "-"}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {table.rows.slice(0, 5).map((row, ri) => (
                          <tr key={ri} className="border-b border-(--line)/50">
                            {row.map((cell, ci) => (
                              <td key={ci} className="px-2 py-1 text-(--ink-2)">{cell || "-"}</td>
                            ))}
                          </tr>
                        ))}
                        {table.rows.length > 5 && (
                          <tr>
                            <td colSpan={table.headers.length} className="px-2 py-1 text-center text-(--ink-3) italic">
                              +{table.rows.length - 5} more rows
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                )}
                {table.footnote && (
                  <p className="mt-2 text-[10px] italic text-(--ink-3)">{table.footnote}</p>
                )}
              </div>
            ))}
          </div>
        </article>

        <article className="glass-card overflow-hidden">
          <header className="border-b border-(--line) bg-(--surface-soft) px-4 py-3 font-mono text-sm text-(--ink-1)">
            Figures ({figures.length})
          </header>
          <div className="max-h-[420px] space-y-4 overflow-auto p-4 text-sm text-(--ink-2)">
            {figures.length === 0 ? "No figures yet." : null}
            {figures.map((figure) => (
              <div className="rounded-xl border border-(--line) p-3" key={figure.figure_index}>
                <h3 className="font-semibold text-(--ink-1)">{figure.label}</h3>
                <p className="mt-1 text-xs">{figure.figure_type}</p>
                <p className="mt-1 text-xs leading-6 text-(--ink-3)">{figure.description || figure.caption || "-"}</p>
                {figureUrls[figure.figure_index] && (
                  <Image
                    src={figureUrls[figure.figure_index]}
                    alt={figure.label}
                    width={300}
                    height={200}
                    className="mt-2 rounded-lg border border-(--line) object-contain"
                    unoptimized
                  />
                )}
              </div>
            ))}
          </div>
        </article>
      </section>
    </main>
  );
}
