-- 仅追加 v3 表到 Realtime（已执行过旧版 supabase-realtime.sql、含 characters/warehouse/activity_log 时用本文件）
-- 在 Supabase → SQL Editor 执行；若某表已在 publication 中可忽略该行报错

alter publication supabase_realtime add table public.campaign_modules;
alter publication supabase_realtime add table public.team_vault;
alter publication supabase_realtime add table public.crafting_projects;
alter publication supabase_realtime add table public.user_prefs;
alter publication supabase_realtime add table public.custom_library;
