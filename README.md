# Research Paper Extraction Hub

One workspace to upload a research paper, extract key information, save it in Supabase, track progress, and download clean outputs.

## What Is Implemented (Phase 1)

- Next.js App Router project scaffolded for Vercel.
- Landing page with hero section, scope explanation, and action buttons.
- Magic link login (Supabase Auth) and auth callback flow.
- Protected tool page at `/app`.
- Protected activity history page at `/history`.
- Extraction API endpoint placeholder in Python: `/api/extract.py`.
- Activity logging API at `/app/api/log/route.ts`.
- Zip download API at `/app/api/download/route.ts`.

## Planned User Flow

1. User logs in using magic link.
2. User uploads research paper PDF.
3. System queues and processes extraction.
4. Results are stored in three segments:
	 - Extracted text
	 - Extracted tables
	 - Extracted figures
5. User reviews results and downloads all outputs.
6. User actions are recorded in activity logs.

## Tech Stack

- Frontend: Next.js 16, React 19, TypeScript, Tailwind CSS
- Auth + DB + Storage: Supabase
- Extraction runtime: Python serverless function (Vercel)
- Deployment target: Vercel

## Required Environment Variables

Create `.env.local`:

```bash
NEXT_PUBLIC_SUPABASE_URL=https://mhwpsshdgieiygzygqdh.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
```

## Supabase Schema (SQL)

```sql
create table papers (
	id uuid default gen_random_uuid() primary key,
	user_id uuid references auth.users(id),
	title text not null,
	authors text,
	journal text,
	doi text,
	extracted_text text,
	status text default 'queued' check (status in ('queued', 'processing', 'done', 'error')),
	created_at timestamptz default now(),
	updated_at timestamptz default now()
);

create table paper_tables (
	id uuid default gen_random_uuid() primary key,
	paper_id uuid references papers(id) on delete cascade,
	table_index integer,
	title text,
	headers jsonb,
	rows jsonb,
	footnote text,
	created_at timestamptz default now()
);

create table paper_figures (
	id uuid default gen_random_uuid() primary key,
	paper_id uuid references papers(id) on delete cascade,
	figure_index integer,
	label text,
	caption text,
	description text,
	figure_type text,
	storage_path text,
	created_at timestamptz default now()
);

create table activity_logs (
	id uuid default gen_random_uuid() primary key,
	user_id uuid references auth.users(id),
	action text not null,
	metadata jsonb default '{}'::jsonb,
	created_at timestamptz default now()
);
```

## Supabase Policies

Run this SQL in your Supabase SQL Editor to enable Row Level Security:

```sql
-- Enable RLS
alter table papers enable row level security;
alter table paper_tables enable row level security;
alter table paper_figures enable row level security;
alter table activity_logs enable row level security;

-- papers: users can only see and manage their own papers
create policy "Users can view own papers"
  on papers for select using (auth.uid() = user_id);
create policy "Users can insert own papers"
  on papers for insert with check (auth.uid() = user_id);
create policy "Users can update own papers"
  on papers for update using (auth.uid() = user_id);

-- paper_tables: access via paper ownership
create policy "Users can view own paper tables"
  on paper_tables for select using (
    exists (select 1 from papers where papers.id = paper_tables.paper_id and papers.user_id = auth.uid())
  );
create policy "Users can insert own paper tables"
  on paper_tables for insert with check (
    exists (select 1 from papers where papers.id = paper_tables.paper_id and papers.user_id = auth.uid())
  );

-- paper_figures: access via paper ownership
create policy "Users can view own paper figures"
  on paper_figures for select using (
    exists (select 1 from papers where papers.id = paper_figures.paper_id and papers.user_id = auth.uid())
  );
create policy "Users can insert own paper figures"
  on paper_figures for insert with check (
    exists (select 1 from papers where papers.id = paper_figures.paper_id and papers.user_id = auth.uid())
  );

-- activity_logs: users can only see and insert their own logs
create policy "Users can view own logs"
  on activity_logs for select using (auth.uid() = user_id);
create policy "Users can insert own logs"
  on activity_logs for insert with check (auth.uid() = user_id);
```

Then create the Storage bucket:

1. Go to Supabase Dashboard → Storage
2. Create bucket named `paper-figures` (set to **private**)
3. Add this storage policy in the SQL Editor:

```sql
create policy "Users can upload own figures"
  on storage.objects for insert
  with check (bucket_id = 'paper-figures' and auth.role() = 'authenticated');

create policy "Users can read own figures"
  on storage.objects for select
  using (bucket_id = 'paper-figures' and auth.role() = 'authenticated');
```

## Run Locally

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

## Vercel Deployment

- Project already linked in Vercel.
- Add all environment variables in Vercel Project Settings.
- Ensure Python dependencies in `requirements.txt` are installed for serverless function runtime.

## Current Gaps (to complete next)

- Deploy to Vercel and verify end-to-end extraction flow.
- Apply Supabase RLS policies and Storage bucket setup (SQL provided above).

## Future Roadmap

1. Vector database export (pgvector / Pinecone).
2. AI summarization of full research papers.
3. Semantic search over extracted corpus.
4. OCR support for scanned PDFs.
5. Batch upload for multiple papers.
6. Citation graph and reference network.
7. Multi-user support with roles.
8. API integrations for Zotero / Notion / Mendeley.

## Legacy Reference

- Original one-page prototype kept as `00_pipeline_hub.html`.
