import Link from "next/link";

export default function Home() {
  return (
    <div className="flex-1 py-10 md:py-14">
      <main className="container-width flex flex-col gap-10">
        <section className="glass-card overflow-hidden p-7 md:p-10">
          <div className="grid gap-8 md:grid-cols-[1.2fr_1fr] md:items-center">
            <div className="space-y-6">
              <span className="chip">Research Automation Workspace</span>
              <h1 className="font-mono text-4xl leading-tight text-(--ink-1) md:text-6xl">
                Extract key details from research papers in one guided flow.
              </h1>
              <p className="max-w-2xl text-base leading-7 text-(--ink-2) md:text-lg">
                Upload your paper, run extraction for text, tables, and figures,
                store everything in Supabase, and download clean structured
                outputs. Progress and queue visibility are built in.
              </p>
              <div className="flex flex-wrap gap-3">
                <Link className="btn-primary" href="/login">
                  Extract Key Details From Research Papers
                </Link>
                <Link className="btn-secondary" href="/app">
                  Open Tool Workspace
                </Link>
              </div>
            </div>
            <div className="rounded-2xl bg-(--surface-soft) p-6">
              <h2 className="font-mono text-lg font-semibold text-(--ink-1)">
                What this tool saves for you
              </h2>
              <ul className="mt-5 space-y-3 text-sm text-(--ink-2)">
                <li>Main body text, cleaned and export-ready</li>
                <li>Structured data tables as JSON rows/columns</li>
                <li>Figure metadata and extracted figure files</li>
                <li>Activity logs: login, extraction, downloads, logout</li>
              </ul>
              <p className="mt-5 rounded-xl bg-white p-4 text-xs leading-6 text-(--ink-3)">
                Designed for one researcher today. Ready to expand to vector
                search, AI summarization, and multi-user collaboration later.
              </p>
            </div>
          </div>
        </section>

        <section className="grid gap-4 md:grid-cols-3">
          <article className="glass-card p-6">
            <h3 className="font-mono text-lg text-(--ink-1)">1. Upload</h3>
            <p className="mt-2 text-sm leading-6 text-(--ink-2)">
              Drop your research PDF, add metadata, and queue extraction with one
              click.
            </p>
          </article>
          <article className="glass-card p-6">
            <h3 className="font-mono text-lg text-(--ink-1)">2. Review</h3>
            <p className="mt-2 text-sm leading-6 text-(--ink-2)">
              Watch status in real time. Preview extracted text, tables, and
              figures in dedicated panels.
            </p>
          </article>
          <article className="glass-card p-6">
            <h3 className="font-mono text-lg text-(--ink-1)">3. Download</h3>
            <p className="mt-2 text-sm leading-6 text-(--ink-2)">
              Export text, tables, figures, or all outputs as a downloadable
              package for your system.
            </p>
          </article>
        </section>

        <section className="glass-card p-7 md:p-10">
          <h2 className="font-mono text-2xl text-(--ink-1)">Scope and next focus</h2>
          <p className="mt-3 text-sm leading-7 text-(--ink-2)">
            Current implementation focuses on reliable extraction, secure login,
            and auditable researcher activity. The next highest-value additions
            are vector database export, AI-based research summarization, OCR for
            scanned PDFs, and semantic search across all stored papers.
          </p>
        </section>
      </main>
    </div>
  );
}
