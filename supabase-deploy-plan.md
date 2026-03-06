# Supabase 部署计划

## 说明

- **Supabase** 提供：PostgreSQL 数据库、认证、Storage；**不提供**静态网站托管。
- **前端托管**：用 Vercel / Netlify / Cloudflare Pages 部署 `dist`，数据与登录走 Supabase。

## 阶段一：先上线静态站（数据仍用 localStorage）

不接 Supabase 也能先部署前端：

1. 在 [Vercel](https://vercel.com) 或 [Netlify](https://netlify.com) 用 GitHub 导入本仓库。
2. 构建命令：`npm run build`，输出目录：`dist`。
3. 部署后即可访问，数据仍保存在各设备浏览器。

## 阶段二：接入 Supabase（团队共享数据 + 登录）

### 1. 创建 Supabase 项目

1. 打开 [Supabase](https://supabase.com) 并登录。
2. New project → 选组织、填项目名、设数据库密码、选区域。
3. 进入项目后：**Settings → API** 复制：
   - `Project URL` → 用作 `VITE_SUPABASE_URL`
   - `anon public` key → 用作 `VITE_SUPABASE_ANON_KEY`

### 2. 本地配置环境变量

在项目根目录复制 `.env.example` 为 `.env`，填入上面两个值。  
前端已通过 `src/lib/supabase.js` 读取，未配置时仍用 localStorage。

### 3. 建表（Supabase SQL Editor 执行）

```sql
-- 角色卡（与 characterStore 对应）
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

-- 团队仓库（与 warehouseStore 对应）
create table if not exists warehouse (
  id uuid primary key default gen_random_uuid(),
  item_id text,
  name text,
  qty int not null default 1,
  created_at timestamptz default now()
);

-- 自定义物品（与 itemDatabase 自定义部分对应）
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

-- 简单 RLS：已登录用户可读写在各自/团队数据（按需细化）
alter table characters enable row level security;
alter table warehouse enable row level security;
alter table custom_items enable row level security;

create policy "Allow all for authenticated" on characters for all using (true);
create policy "Allow all for authenticated" on warehouse for all using (true);
create policy "Allow all for authenticated" on custom_items for all using (true);
```

（若暂时不启用登录，可先建表并放宽 RLS 或关闭，上线后再收紧。）

### 4. 启用认证（可选）

在 Supabase 控制台：**Authentication → Providers** 启用「Email」或「Magic Link」等。  
前端将 `AuthContext` 改为使用 `supabase.auth`，登录态与现有「按 owner 过滤角色」逻辑对接。

### 5. 迁移 store 到 Supabase

- `src/lib/characterStore.js`：读写改为 `supabase.from('characters')`，保留现有 API（getCharacters、addCharacter 等）。
- `src/lib/warehouseStore.js`：读写改为 `supabase.from('warehouse')`。
- `src/data/itemDatabase.js`：自定义物品读写改为 `supabase.from('custom_items')`，内置 `ITEM_DATABASE` 仍在前端。

未配置 `VITE_SUPABASE_*` 时继续用 localStorage（可在 supabase.js 中 `isSupabaseEnabled()` 分支）。

## 阶段三：前端部署到 Vercel/Netlify

1. 在托管平台为项目配置环境变量：`VITE_SUPABASE_URL`、`VITE_SUPABASE_ANON_KEY`。
2. 构建命令：`npm run build`，发布目录：`dist`。
3. 部署后访问的即为「前端 + Supabase 后端」的完整应用。

## 注意事项

- **中文**：PostgreSQL / Supabase 使用 UTF-8，中文无问题。
- **密钥**：仅在前端使用 `anon` key，敏感操作放 Supabase Edge Functions 或 RLS，不要暴露 service_role key。
