# 登录页一直显示「未连接云端」时

## 最常见原因

1. **没有 `.env` 文件**，或只改了 `.env.example`（应用只读 `.env`）。
2. 变量名写错：必须是 **`VITE_SUPABASE_URL`** 和 **`VITE_SUPABASE_ANON_KEY`**（不能写成 `SUPABASE_URL` 等，Vite 不会注入到网页里）。
3. **改完 `.env` 没重启** `npm run dev`（Vite 只在启动时读环境变量）。
4. **线上 Vercel**：只在后台加了变量，但**没有 Redeploy**，旧网页里仍然没有这两个值。

---

## 本地正确示例（根目录 `.env`）

```env
VITE_SUPABASE_URL=https://你的项目id.supabase.co
VITE_SUPABASE_ANON_KEY=sb_publishable_后面整串复制
```

- 不要加中文占位符；不要多空格；一般**不要**给值加引号。
- Windows 若文件名变成 `.env.txt`，在资源管理器里开「显示扩展名」改回 `.env`。

---

## 线上 Vercel

1. Project → **Settings** → **Environment Variables**
2. 添加 **Key** 与本地完全一致：`VITE_SUPABASE_URL`、`VITE_SUPABASE_ANON_KEY`
3. **Deployments** → 最新部署 → **⋯** → **Redeploy**

---

## 自检

保存代码后重新打开登录页：黄色框最下面会显示「Project URL ✓/✗」「Publishable 密钥 ✓/✗」。  
两项都是 ✓ 仍无法读写数据时，再查 Supabase 表结构、RLS、浏览器控制台网络报错。
