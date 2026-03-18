-- 团队动态日志（首页展示：谁向仓库放了什么、谁往背包加了什么等）
create table if not exists activity_log (
  id uuid primary key default gen_random_uuid(),
  module_id text not null default 'default',
  actor text not null,
  summary text not null,
  created_at timestamptz default now()
);

create index if not exists idx_activity_log_created on activity_log (created_at desc);

alter table activity_log enable row level security;
drop policy if exists "Allow all" on activity_log;
create policy "Allow all" on activity_log for all using (true) with check (true);

-- Realtime（可选，与 supabase-realtime.sql 二选一执行或合并）
-- alter publication supabase_realtime add table public.activity_log;
