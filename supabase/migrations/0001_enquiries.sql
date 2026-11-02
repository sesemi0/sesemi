-- SESEMI enquiries table. The service role (used by the contact function)
-- bypasses RLS; nothing else gets access until you grant it on purpose.
create table if not exists public.enquiries (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  name text not null,
  contact text not null,
  message text,
  service text,
  ip text,
  user_agent text,
  status text not null default 'new'
);

create index if not exists enquiries_created_at_idx on public.enquiries (created_at desc);

-- Optional hardening: simple per-IP rate limit view for manual review.
-- The contact function intentionally stays stateless; add a throttle at the
-- edge (e.g. Upstash, Cloudflare) if abuse ever shows up.
