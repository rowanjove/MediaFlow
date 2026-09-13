# MediaFlow · 密钥与环境变量具体配置方案

本文档详细说明 MediaFlow 媒体解析站涉及的所有密钥、Cookie、上游解析服务地址及环境变量的具体配置方法、获取途径与验证流程。

---

## 1. 密钥清单总览

| 变量名 | 敏感级别 | 必填项 | 适用平台/功能 | 说明与默认值 |
|---|---|---|---|---|
| **`ADMIN_SECRET`** | **高（Secret）** | **必须** | 隐藏管理后台、运维 API | 访问管理端和提升缓存世代的身份凭证。未配置则管理接口返回 503。 |
| **`COBALT_PRIMARY_URL`** | 普通变量 | 可选 | YouTube / Instagram / 国际平台 | Cobalt 解析服务主地址。建议自建，也可填第三方稳定实例。 |
| **`COBALT_FALLBACK_URLS`** | 普通变量 | 可选 | 国际平台多实例容灾 | 备用 Cobalt 实例列表，多个地址用半角逗号 `,` 分隔。 |
| **`COBALT_API_KEY`** | **高（Secret）** | 可选 | Cobalt 授权鉴权 | 若所使用的 Cobalt 实例启用了 API Key / JWT 鉴权则必须提供。 |
| **`BILIBILI_COOKIE`** | **中（Secret）** | 可选 | 哔哩哔哩 (B站) | 用于获取 1080P/1080P60 高码率及高品质音频流。未填时降级返回 360P/480P 公开流。 |
| **`DOUYIN_COOKIE`** | **中（Secret）** | 可选 | 抖音 | 包含 `ttwid` 等反爬凭据。系统自带公开抓取，配置后在高并发下更稳定。 |
| **`WEIBO_COOKIE`** | **中（Secret）** | 可选 | 微博 | 系统自带免登录访客凭据；若解析需要登录才可见的博文时需配置 `SUB`。 |
| **`RATE_LIMIT_COUNT`** | 普通变量 | 可选 | 全局防刷保护 | 每个 IP 在时间窗口内的最大请求次数，默认 `60`。 |
| **`RATE_LIMIT_WINDOW`** | 普通变量 | 可选 | 全局防刷保护 | 防刷限流滑动窗口大小（秒），默认 `60`。 |

> [!WARNING]
> **切勿将包含真实密钥的配置提交到公开代码仓库！**
> 敏感密钥必须通过 Cloudflare Worker Secrets（生产）或 `.dev.vars`（本地，已在 `.gitignore` 中）注入。

---

## 2. 本地开发配置方法

本地使用 `wrangler dev` 时，Wrangler 会自动读取根目录下的 `.dev.vars` 文件。

### 步骤 1：复制示例配置文件
在项目根目录下复制 `.dev.vars.example` 生成 `.dev.vars`：
```bash
# Windows PowerShell
Copy-Item .dev.vars.example .dev.vars

# 或 Bash
cp .dev.vars.example .dev.vars
```

### 步骤 2：填入本地环境变量与密钥
编辑 `.dev.vars`，按需填入参数（单行或双引号包裹）：
```ini
# 管理后台密钥（本地测试建议设一个简单字符串）
ADMIN_SECRET=my_local_admin_secret_2026

# 国际平台解析服务（如果测试 YouTube / Instagram）
COBALT_PRIMARY_URL=https://your-cobalt-instance.com
COBALT_API_KEY=
COBALT_FALLBACK_URLS=

# 国内平台高画质/防风控 Cookie（可选，直接粘贴 Cookie 字符串）
BILIBILI_COOKIE="SESSDATA=xxxxxx; bili_jct=xxxxxx; buvid3=xxxxxx"
DOUYIN_COOKIE="ttwid=xxxxxx"
WEIBO_COOKIE="SUB=xxxxxx"

# 本地调试限流阈值（可调大防止本地测试触发 429）
RATE_LIMIT_COUNT=1000
RATE_LIMIT_WINDOW=60
```

---

## 3. 生产环境配置方法（Cloudflare Workers）

生产环境有两种配置途径：**Wrangler CLI 命令行** 或 **Cloudflare Dashboard 网页端**。

### 途径 A：使用 Wrangler 命令行（推荐）

#### 1. 注入敏感密钥（Secrets，加密存储）
在终端中执行以下命令，根据提示输入密码/密钥（输入时不会在屏幕上明文回显）：

```bash
# 1. 必须配置：管理后台密钥
npx wrangler secret put ADMIN_SECRET

# 2. 可选配置：Cobalt API Key（若自建端点开启鉴权）
npx wrangler secret put COBALT_API_KEY

# 3. 可选配置：B站高画质 Cookie
npx wrangler secret put BILIBILI_COOKIE

# 4. 可选配置：抖音增强 Cookie
npx wrangler secret put DOUYIN_COOKIE

# 5. 可选配置：微博增强 Cookie
npx wrangler secret put WEIBO_COOKIE
```

#### 2. 配置非敏感变量（Vars）
编辑项目根目录的 `wrangler.jsonc`，在 `vars` 节点中修改或追加：
```jsonc
{
  // ... 其他配置 ...
  "vars": {
    "APP_NAME": "MediaFlow",
    // 你的自建或第三方 Cobalt 实例地址（末尾不带斜杠）
    "COBALT_PRIMARY_URL": "https://cobalt.yourdomain.com",
    // 备用 Cobalt 实例（逗号分隔）
    "COBALT_FALLBACK_URLS": "https://cobalt-backup.yourdomain.com",
    // 生产限流：每个 IP 每 60 秒最多允许 60 次解析
    "RATE_LIMIT_COUNT": "60",
    "RATE_LIMIT_WINDOW": "60"
  }
}
```
配置完成后重新部署生效：
```bash
npm run build
npx wrangler deploy
```

---

### 途径 B：使用 Cloudflare Dashboard 网页端

1. 登录 [Cloudflare 仪表盘](https://dash.cloudflare.com/)。
2. 进入 **Compute (Workers & Pages)** -> 点击你的 Worker 服务（`media-parser`）。
3. 进入 **Settings**（设置）-> **Variables and Secrets**（变量和机密）。
4. 在 **Secrets** 区域点击 **Add**，添加 `ADMIN_SECRET`、`BILIBILI_COOKIE` 等敏感机密。
5. 在 **Variables** 区域添加或修改 `COBALT_PRIMARY_URL` 等普通变量。
6. 点击 **Deploy** 保存生效。

---

## 4. 各项密钥获取与生成说明

### 4.1 `ADMIN_SECRET`（管理密钥）
- **推荐生成方式**：在终端生成高强度随机字符串：
  ```bash
  # Linux / macOS / Git Bash
  openssl rand -hex 24

  # 或在 Node.js 中生成
  node -e "console.log(crypto.randomUUID())"
  ```
- **使用场景**：
  - 前端任意页面按下组合键 `Ctrl + Shift + .`（Mac 上为 `Cmd + Shift + .`）或连续点击顶部 Logo 5 次，在弹出的管理浮层输入该密钥即可进入后台控制台；
  - 访问管理员 API：`GET /api/v1/admin/stats?key=你的密钥`，或在请求头携带 `X-Admin-Key: 你的密钥`。

---

### 4.2 `COBALT_PRIMARY_URL` 与 `COBALT_API_KEY`（国际解析）
- **背景说明**：
  官方公共实例 `api.cobalt.tools` 现已要求 Cloudflare Turnstile 人机验证及专属 API Key，未配置密钥直接调用会被阻断。
- **推荐方案（自建 Cobalt）**：
  使用轻量 VPS（如轻量云、Oracle、DigitalOcean 等）通过 Docker 部署官方开源 Cobalt：
  ```bash
  docker run -d \
    --name cobalt \
    --restart unless-stopped \
    -p 9000:9000 \
    -e API_URL="https://cobalt.yourdomain.com" \
    ghcr.io/imputnet/cobalt:10
  ```
  在 Cloudflare 中将 `COBALT_PRIMARY_URL` 设为 `https://cobalt.yourdomain.com`。由于是自有实例，无需设置 `COBALT_API_KEY` 即可免登录直接解析 YouTube / Instagram。

---

### 4.3 `BILIBILI_COOKIE`（B站高清画质）
- **提取方式**：
  1. 打开电脑浏览器无痕模式，访问并登录 [bilibili.com](https://www.bilibili.com/)；
  2. 按 `F12` 打开开发者工具，切换到 **Application**（应用程序） -> **Storage** -> **Cookies** -> `https://www.bilibili.com`；
  3. 找到并重点复制以下字段（也可以直接从任意请求的 Request Headers 中复制完整 `Cookie` 字符串）：
     - `SESSDATA=...`（核心登录态凭证）
     - `bili_jct=...`（CSRF 凭据）
     - `buvid3=...`
     - `DedeUserID=...`
  4. 组合格式形如：`SESSDATA=abc123...; bili_jct=def456...; buvid3=xyz...`
- **生效效果**：
  配置后，解析 B 站视频时将直接解锁 1080P/1080P60 高清 DASH 视频流及 320Kbps 高保真音频轨。

---

### 4.4 `DOUYIN_COOKIE`（抖音防风控）
- **提取方式**：
  1. 浏览器访问 [douyin.com](https://www.douyin.com/)；
  2. 按 `F12` 打开 Network（网络）标签页，筛选 `fetch/xhr`；
  3. 找到任意接口请求（例如 `iteminfo` 或 `web/api`），查看 **Request Headers** 中的 `Cookie`；
  4. 重点确保包含 `ttwid=...` 字段，直接整串复制。
- **生效效果**：
  增强公开接口请求稳定性，降低抖音机房风控与滑动验证码拦截率。

---

### 4.5 `WEIBO_COOKIE`（微博私密内容提取）
- **提取方式**：
  1. 浏览器访问 [m.weibo.cn](https://m.weibo.cn/) 并登录账号；
  2. 按 `F12` 打开开发者工具，查看 Application -> Cookies；
  3. 复制 `SUB=...` 和 `SUBP=...`；
  4. 组合格式形如：`SUB=789abc...; SUBP=0033...`。
- **生效效果**：
  可解析需要登录权限或博主仅粉丝可见的公开多媒体内容。

---

## 5. 配置验证与状态检查

部署完成后，可通过系统内置的健康巡检与管理接口验证密钥是否正确识别。

### 5.1 检查常规运行状态
浏览器或终端访问：
```bash
curl https://你的域名/health
```
响应示例：
```json
{
  "status": "ok",
  "timestamp": "2026-09-12T02:00:00.000Z",
  "providers": {
    "douyin-native-primary": "healthy",
    "bilibili-native": "healthy",
    "xiaohongshu-native": "healthy",
    "kuaishou-native": "healthy",
    "weibo-native": "healthy"
  }
}
```

### 5.2 检查 Cookie 与密钥装载状态
使用配置的 `ADMIN_SECRET` 请求管理接口：
```bash
curl -H "X-Admin-Key: 你的ADMIN_SECRET" https://你的域名/api/v1/admin/stats
```
响应中将明确返回各项 Cookie 和上游服务的装载指示（仅返回布尔值，不泄露明文）：
```json
{
  "success": true,
  "data": {
    "uptime": 1200,
    "cookiesConfigured": {
      "douyin": true,
      "bilibili": true,
      "weibo": false
    },
    "cobaltEndpoint": "https://cobalt.yourdomain.com",
    "providers": [...]
  }
}
```
若 `cookiesConfigured` 对应项为 `true`，即代表该平台的增强 Cookie 已成功载入并就绪！
