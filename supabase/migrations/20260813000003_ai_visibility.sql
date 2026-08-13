-- ============================================================================
-- Hiện diện AI — làm thật ba phần: llms.txt, điểm citability theo trang, và
-- câu hỏi theo dõi (CRUD thật). Phần CHẠY kiểm tra thật trên từng engine
-- (ChatGPT/Claude/Gemini/Perplexity — Google AI Overviews và Copilot không
-- có API công khai) cần API key riêng của người dùng, CHƯA làm ở migration
-- này — bảng `citation_checks` tạo sẵn khung, chưa có gì ghi vào.
-- ============================================================================

-- llms.txt: nội dung tự sinh, tuỳ thuộc website — Site tự sở hữu, một cái
-- một lúc, không cần bảng riêng.
alter table public.sites add column llms_txt_content text;
alter table public.sites add column llms_txt_generated_at timestamptz;

-- Điểm citability từng trang tính TRONG CÙNG một lượt quét với SEO/GEO/AIO
-- (`audit_runs`) — dùng lại đúng dữ liệu đã crawl, không quét thêm lần nữa.
alter table public.audit_runs add column page_citability jsonb not null default '[]'::jsonb;

-- Site có nhiều URL sitemap hơn ngân sách quét (`MAX_PAGES` ở crawler.ts) thì
-- lượt quét chỉ phủ MỘT PHẦN — ghi rõ tổng số thật thay vì để UI đoán từ
-- `pages_scanned` một mình (không phân biệt được "site chỉ có đúng 12 trang"
-- với "site có 4.000 trang, mới quét 100").
alter table public.audit_runs add column sitemap_url_count integer not null default 0;
alter table public.audit_runs add column truncated boolean not null default false;

-- ============================================================================
-- Câu hỏi theo dõi — đơn vị đo của GEO, tương đương "từ khoá" của SEO cũ.
-- ============================================================================

create table public.tracked_prompts (
  id          uuid primary key default gen_random_uuid(),
  site_id     uuid not null references public.sites (id) on delete cascade,
  text        text not null,
  intent      text not null check (intent in ('informational', 'comparison', 'recommendation', 'transactional')),
  engines     text[] not null default '{}',
  cadence     text not null default 'weekly' check (cadence in ('daily', 'weekly')),
  enabled     boolean not null default true,
  created_by  uuid references auth.users (id) on delete set null,
  created_at  timestamptz not null default now()
);

create index tracked_prompts_site_idx on public.tracked_prompts (site_id);

alter table public.tracked_prompts enable row level security;

create policy "tracked_prompts_select_member"
  on public.tracked_prompts for select
  to authenticated
  using (public.is_site_member(site_id));

create policy "tracked_prompts_insert_admin"
  on public.tracked_prompts for insert
  to authenticated
  with check (public.has_site_role(site_id, array['owner','admin']::public.site_role[]));

create policy "tracked_prompts_update_admin"
  on public.tracked_prompts for update
  to authenticated
  using (public.has_site_role(site_id, array['owner','admin']::public.site_role[]))
  with check (public.has_site_role(site_id, array['owner','admin']::public.site_role[]));

create policy "tracked_prompts_delete_admin"
  on public.tracked_prompts for delete
  to authenticated
  using (public.has_site_role(site_id, array['owner','admin']::public.site_role[]));

-- ============================================================================
-- Kết quả kiểm tra trích dẫn — khung sẵn cho lúc nối API AI thật. Chỉ đọc qua
-- vai trò thường (giống metrics_daily) — ghi sẽ do server action/job chạy
-- kiểm tra thật đảm nhiệm bằng service_role, chưa tồn tại ở bản này.
-- ============================================================================

create table public.citation_checks (
  id                 uuid primary key default gen_random_uuid(),
  prompt_id          uuid not null references public.tracked_prompts (id) on delete cascade,
  engine             text not null check (engine in ('chatgpt', 'perplexity', 'google-ai-overview', 'claude', 'gemini', 'copilot')),
  checked_at         timestamptz not null default now(),
  date               date not null default current_date,
  cited              boolean not null,
  position           integer,
  sentiment          text check (sentiment in ('positive', 'neutral', 'negative')),
  excerpt            text,
  cited_url          text,
  competitors_cited  text[] not null default '{}'
);

create index citation_checks_prompt_idx on public.citation_checks (prompt_id, date desc);

alter table public.citation_checks enable row level security;

create policy "citation_checks_select_member"
  on public.citation_checks for select
  to authenticated
  using (
    exists (
      select 1 from public.tracked_prompts p
      where p.id = prompt_id and public.is_site_member(p.site_id)
    )
  );
