-- 角色卡
create table if not exists characters (
  id uuid primary key default gen_random_uuid(),
  owner text not null,
  name text not null default '未命名',
  class text,
  class_level int default 1,
  multiclass jsonb default '[]',
  prestige jsonb default '[]',
  level int default 1,
  xp int default 0,
  hp jsonb default '{"current":0,"max":0,"temp":0}',
  abilities jsonb default '{}',
  saving_throws jsonb default '{}',
  skills jsonb default '{}',
  avatar text,
  appearance jsonb default '{}',
  inventory jsonb default '[]',
  equipment jsonb default '{}',
  buffs jsonb default '[]',
  notes text default '',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- 团队仓库
create table if not exists warehouse (
  id uuid primary key default gen_random_uuid(),
  item_id text,
  name text,
  qty int not null default 1,
  created_at timestamptz default now()
);

-- 自定义物品
create table if not exists custom_items (
  id text primary key,
  category text,
  name_cn text,
  attack text,
  notes text,
  damage text,
  weight text,
  price text,
  detail text,
  created_at timestamptz default now()
);

-- 允许访问（先简单放开，后续可再限制）
alter table characters enable row level security;
alter table warehouse enable row level security;
alter table custom_items enable row level security;

create policy "Allow all" on characters for all using (true);
create policy "Allow all" on warehouse for all using (true);
create policy "Allow all" on custom_items for all using (true);
