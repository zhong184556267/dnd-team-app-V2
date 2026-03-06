# Supabase 部署教程（零基础、中文版）

本教程会一步一步带你完成部署，每一步都会说明「点哪里」「填什么」。  
界面是英文的也没关系，我会告诉你对应的中文意思。

---

## 第一步：注册 Supabase 账号

1. 打开浏览器，访问：**https://supabase.com**
2. 点击右上角 **「Sign in」**（登录 / 注册）
3. 选择 **「Sign in with GitHub」** 或 **「Sign in with Google」**
   - 用你的 GitHub 或 Google 账号登录即可，无需单独注册
4. 登录成功后，会进入 Supabase 的 **Dashboard**（控制台 / 仪表盘）

---

## 第二步：创建新项目

1. 在控制台里，点击 **「New project」**（新建项目）
2. 如果提示选择 **Organization**（组织）：
   - 选默认的 **Personal**（个人）即可
3. 填写项目信息：

   | 界面上的英文 | 中文意思 | 你可以填 |
   |-------------|----------|----------|
   | **Name** | 项目名称 | `dnd-team-app` 或任意英文名 |
   | **Database Password** | 数据库密码 | 自己设一个密码，**务必记住**（至少 6 位） |
   | **Region** | 服务器所在地区 | 选 **Singapore**（新加坡）或 **Tokyo**（东京），离中国近 |

4. 点击 **「Create new project」**（创建新项目）
5. 等待 1～2 分钟，项目创建完成后会自动进入项目页面

---

## 第三步：获取两个密钥（重要）

这两个密钥后面要填到你的项目里，让网站能连接 Supabase。

1. 在左侧菜单找到 **「Settings」**（设置），点击
2. 在设置里找到 **「API」**，点击
3. 在 **Project URL** 和 **Project API keys** 区域，你会看到：

   | 名称 | 说明 | 复制哪个 |
   |-----|------|----------|
   | **Project URL** | 项目地址 | 整行，类似 `https://xxxxx.supabase.co` |
   | **anon public** | 公开密钥 | 点右侧复制按钮，一长串字符 |

4. 把这两个值**先记在记事本**里，后面会用到：
   - `VITE_SUPABASE_URL` = Project URL
   - `VITE_SUPABASE_ANON_KEY` = anon public 那一行的密钥

---

## 第四步：创建数据库表（复制粘贴即可）

这一步是「建表」，相当于在 Supabase 里准备好存放角色、仓库、物品的「格子」。  
你不需要懂 SQL，只要复制粘贴运行即可。

> ⚠️ **注意**：只复制 SQL 代码，**不要**复制 \`\`\`sql 或 \`\`\` 这种标记，否则会报错！

1. 在左侧菜单找到 **「SQL Editor」**（SQL 编辑器），点击
2. 点击 **「New query」**（新建查询）
3. 打开项目里的 **`supabase-init.sql`** 文件（在 `dnd-team-app` 文件夹里），按 **Ctrl+A** 全选，**Ctrl+C** 复制，粘贴到 Supabase 左侧的输入框里
4. 点击右下角 **「Run」**（运行）按钮
5. 如果成功，会显示 **「Success. No rows returned」**（成功，没有返回行）——这是正常的

---

## 第五步：在本地项目里填入密钥

1. 打开你的项目文件夹 `dnd-team-app`
2. 找到 `.env.example` 文件，**复制一份**，重命名为 `.env`
   - 如果看不到 `.env`，可能是被隐藏了，在资源管理器中开启「显示隐藏文件」
3. 用记事本或 VS Code 打开 `.env`，把内容改成：

```
VITE_SUPABASE_URL=这里粘贴第三步的 Project URL
VITE_SUPABASE_ANON_KEY=这里粘贴第三步的 anon public 密钥
```

例如：
```
VITE_SUPABASE_URL=https://abcdefg.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.很长的一串...
```

4. 保存文件

> ⚠️ 注意：`.env` 不要上传到 GitHub，里面是密钥。项目里通常已有 `.gitignore` 会忽略它。

---

## 第六步：部署网站到网上（用 Vercel）

Supabase 只负责「数据」，网站页面需要放到别的地方。**Vercel** 可以免费托管你的前端。

### 6.1 把代码放到 GitHub

1. 如果还没有 GitHub 账号，先去 **https://github.com** 注册
2. 登录 GitHub，点击右上角 **「+」→「New repository」**（新建仓库）
3. 仓库名填 `dnd-team-app`，选 **Public**，点 **「Create repository」**
4. 在本地项目文件夹打开命令行（PowerShell 或 CMD），执行：

```bash
git init
git add .
git commit -m "初始提交"
git branch -M main
git remote add origin https://github.com/你的用户名/dnd-team-app.git
git push -u origin main
```

（把 `你的用户名` 换成你的 GitHub 用户名）

### 6.2 用 Vercel 部署

1. 打开 **https://vercel.com**，用 **GitHub** 登录
2. 点击 **「Add New...」** → **「Project」**（添加新项目）
3. 在列表里找到 `dnd-team-app`，点 **「Import」**（导入）
4. 在 **Environment Variables**（环境变量）里，添加两个变量：

   | Name（名称） | Value（值） |
   |-------------|-------------|
   | `VITE_SUPABASE_URL` | 第三步的 Project URL |
   | `VITE_SUPABASE_ANON_KEY` | 第三步的 anon public 密钥 |

5. 点击 **「Deploy」**（部署）
6. 等待 1～2 分钟，部署完成后会给你一个网址，例如：`https://dnd-team-app-xxx.vercel.app`

---

## 完成之后

- 用 Vercel 给的网址，就可以在手机上、电脑上访问你的 D&D 团队小助手
- **重要**：完成上述步骤后，网站可以访问，但角色、仓库、物品数据目前仍保存在各人浏览器本地。要让数据真正存到 Supabase、团队共用，需要再修改代码（把 `characterStore`、`warehouseStore`、`itemDatabase` 改为读写 Supabase）。完成第六步后，可以让开发者帮你做这一步。

---

## 常见问题

**Q：运行 SQL 时报错？**  
A：检查是否整段复制、没有漏掉分号。如果提示表已存在，可以忽略，说明之前已经建过了。

**Q：部署后打开网页是白的？**  
A：检查 Vercel 的环境变量是否填对，尤其是 `VITE_SUPABASE_URL` 和 `VITE_SUPABASE_ANON_KEY`。

**Q：我还想用本地 localStorage，不接 Supabase 可以吗？**  
A：可以。不填 `.env` 或删掉这两个变量，程序会自动用本地存储。

**Q：界面全是英文看不懂？**  
A：可以用浏览器翻译（Chrome 右键「翻译成中文」），或对照本教程里的中英对照表操作。
