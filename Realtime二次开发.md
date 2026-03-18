# Supabase Realtime 二次开发说明

已实现：**数据库里相关表一有变更，已打开的网页会自动拉取最新数据并刷新**，无需全员手动刷新。

---

## 1. 在 Supabase 里开启 Realtime（必做）

### 方式 A：SQL（推荐）

1. Supabase → **SQL Editor** → **New query**
2. **新项目或从未开过 Realtime**：打开 **`supabase-realtime.sql`**，全选复制后 **Run**。
3. **曾执行过旧版（只有 characters / warehouse / activity_log）**：请执行 **`supabase-realtime-v3-only.sql`**，把金库、制作、模组等 v3 表加入 publication（避免前半段重复 add 报错）。
4. 若提示某表 **已在 publication 中**，可忽略该行。

### 方式 B：界面

在 **Table Editor** 里对需要的表开启 **Realtime**（与 SQL 等价）。

---

## 2. 已订阅的表与浏览器事件

| 表 | 说明 | 刷新逻辑 |
|----|------|----------|
| `characters` | 角色 | 防抖拉角色缓存 → `dnd-realtime-characters` |
| `warehouse` | 当前模组仓库 | 拉仓库 → `dnd-realtime-warehouse` |
| `activity_log` | 团队动态 | `dnd-realtime-activity` |
| `team_vault` | 当前模组金库 | 拉金库 → `dnd-realtime-team-vault` |
| `crafting_projects` | 当前模组魔法制作 | 拉制作 → `dnd-realtime-crafting` |
| `campaign_modules` | 模组列表 | 拉模组 → `dnd-realtime-modules`（ModuleContext 刷新） |
| `user_prefs` | 当前登录名的偏好 | 拉偏好 → `dnd-realtime-user-prefs`（含当前模组、默认角色等） |
| `custom_library` | 自定义物品/法术 | 拉缓存 → `dnd-realtime-custom-library` |

代码入口：**`src/lib/realtimeSync.js`**（随当前模组切换金库/制作/仓库过滤条件）。

自定义页面可监听：

- `dnd-realtime-characters` / `dnd-realtime-warehouse` / `dnd-realtime-activity`
- `dnd-realtime-team-vault` / `dnd-realtime-crafting`
- `dnd-realtime-modules` / `dnd-realtime-user-prefs` / `dnd-realtime-custom-library`

---

## 3. 限制与说明

- 需已执行 **`supabase-schema-v3-team-data.sql`**，金库/制作等才会写入可被 Realtime 监听的表。
- 非管理员仍会按规则只拉自己的角色；Realtime 可能多几次无效刷新（防抖缓解）。
- 订阅失败时控制台会提示检查 Realtime 与 SQL 是否执行完整。

---

## 4. 验证

1. 两台设备同一网址、各登录（可同模组）。
2. A 改金库、制作进度或模组列表并保存。
3. B 不刷新页面，约 **0.5 秒内**应看到对应界面更新（仓库/金库/制作与**当前模组**一致时最明显）。
