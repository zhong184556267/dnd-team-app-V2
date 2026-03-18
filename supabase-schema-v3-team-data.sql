-- v3：模组、金库、制作、用户偏好、自定义物品/法术 全部进 Supabase（启用后不再用本地存这些）
-- 在 Supabase SQL Editor 执行（可与 v2 同库共存）

create table if not exists campaign_modules (
  id text primary key,
  name text not null,
  sort_order int not null default 0,
  updated_at timestamptz default now()
);

create table if not exists team_vault (
  module_id text primary key,
  data jsonb not null default '{}',
  updated_at timestamptz default now()
);

create table if not exists crafting_projects (
  module_id text primary key,
  data jsonb not null default '[]',
  updated_at timestamptz default now()
);

create table if not exists user_prefs (
  owner text primary key,
  current_module_id text,
  default_chars jsonb not null default '{}',
  updated_at timestamptz default now()
);

create table if not exists custom_library (
  lib_key text primary key,
  data jsonb not null default '[]',
  updated_at timestamptz default now()
);

alter table campaign_modules enable row level security;
alter table team_vault enable row level security;
alter table crafting_projects enable row level security;
alter table user_prefs enable row level security;
alter table custom_library enable row level security;

drop policy if exists "Allow all" on campaign_modules;
drop policy if exists "Allow all" on team_vault;
drop policy if exists "Allow all" on crafting_projects;
drop policy if exists "Allow all" on user_prefs;
drop policy if exists "Allow all" on custom_library;

create policy "Allow all" on campaign_modules for all using (true) with check (true);
create policy "Allow all" on team_vault for all using (true) with check (true);
create policy "Allow all" on crafting_projects for all using (true) with check (true);
create policy "Allow all" on user_prefs for all using (true) with check (true);
create policy "Allow all" on custom_library for all using (true) with check (true);

-- 若无模组则插入默认一行（应用也会兜底）
insert into campaign_modules (id, name, sort_order)
values ('default', '默认模组', 0)
on conflict (id) do nothing;

-- 若匿名无法读写模组表（表现为改名/新建无效），在 SQL Editor 执行以下授权后再试：
-- grant usage on schema public to anon, authenticated;
-- grant select, insert, update, delete on public.campaign_modules to anon, authenticated;
