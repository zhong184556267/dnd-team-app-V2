-- 团队共享数据 schema（v2：角色与仓库用 jsonb 存完整文档，便于 10 人各自角色 + 共享仓库）
-- 若你之前跑过旧版 supabase-init.sql，可先备份后执行：DROP TABLE IF EXISTS characters CASCADE; DROP TABLE IF EXISTS warehouse CASCADE; 再跑本文件。

-- 角色表：id、所有者、模组、完整数据(jsonb)
create table if not exists characters (
  id uuid primary key default gen_random_uuid(),
  owner text not null,
  module_id text not null default 'default',
  data jsonb not null default '{}',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_characters_owner_module on characters (owner, module_id);

-- 团队仓库表：按模组一行，data 为物品数组
create table if not exists warehouse (
  module_id text primary key,
  data jsonb not null default '[]',
  updated_at timestamptz default now()
);

-- RLS：允许匿名读写（用 anon key 即可，适合小团队信任场景）
alter table characters enable row level security;
alter table warehouse enable row level security;

drop policy if exists "Allow all" on characters;
drop policy if exists "Allow all" on warehouse;
create policy "Allow all" on characters for all using (true) with check (true);
create policy "Allow all" on warehouse for all using (true) with check (true);
