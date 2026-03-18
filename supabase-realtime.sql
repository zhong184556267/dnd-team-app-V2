-- 开启 Realtime：多人 / 多设备改库后，网页可自动刷新（无需手动 F5）
-- 在 Supabase → SQL Editor 执行一次；若提示「已在 publication 中」可忽略该行
-- 若你曾执行过**仅含下面 v2 三表**的旧脚本，请勿重复执行本文件前半段，改执行 supabase-realtime-v3-only.sql

-- v2：角色、仓库、团队动态
alter publication supabase_realtime add table public.characters;
alter publication supabase_realtime add table public.warehouse;
alter publication supabase_realtime add table public.activity_log;

-- v3：模组列表、金库、魔法制作、用户偏好、自定义物品/法术
alter publication supabase_realtime add table public.campaign_modules;
alter publication supabase_realtime add table public.team_vault;
alter publication supabase_realtime add table public.crafting_projects;
alter publication supabase_realtime add table public.user_prefs;
alter publication supabase_realtime add table public.custom_library;
