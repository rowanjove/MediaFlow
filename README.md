<div align="center">

# MediaFlow

**现代化轻量多平台媒体直链解析与下载引擎**

面向 Cloudflare Workers 边缘计算环境构建，解析公开音视频与图集链接并返回原站 CDN 直链，浏览器端直连下载，服务端零媒体流量中转。

[English](./README_EN.md) · [简体中文](./README.md) · [常见问题](./src/pages/faq.astro) · [密钥配置](./SECRETS.md)

<br/>

<img src="./docs/screenshots/preview-dark.png" alt="MediaFlow Dark Preview" width="860" />

<br/>

<details>
  <summary>切换浅色模式预览 (Light Theme)</summary>
  <br/>
  <img src="./docs/screenshots/preview-light.png" alt="MediaFlow Light Preview" width="860" />
</details>

</div>

---

## 核心架构与特性

- **直连原站 CDN**：解析接口仅返回结构化媒体元数据与带有时效性的源站直链，客户端直接向 CDN 发起下载，不消耗 Worker 带宽与流量配额。
- **28+ 平台覆盖**：支持抖音、哔哩哔哩（WBI 签名与 DASH 音视频分轨）、快手、小红书、微博、TikTok、X (Twitter)、YouTube、Instagram 及 19 个国内扩展音视频平台。
- **容灾降级与自愈熔断**：
  - 抖音 Native 双路线降级（主 API $\rightarrow$ 分享页 RouterData 反爬解析）；
  - 国际平台混合降级（原生轻量解析 $\rightarrow$ 外部 Cobalt 实例集群）；
  - 上游异常时自动触发熔断与健康度惩罚，全熔断后启动 Half-Open 试探自愈。
- **安全与边缘防护**：短链逐跳重定向安全检查、私有 IP / 内网网段拦截（防 SSRF）、IP 窗口滑动限流、隐藏管理后台（世代缓存刷新与指标看板）。
- **极速现代化前端**：基于 Astro 静态预编译 + Tailwind CSS，自带深浅色主题自适应与中英文一键无刷新双语切换。

---

## 支持平台矩阵

| 分类 | 平台 | 解析策略 | 降级机制 (Fallback) | 凭据依赖 |
|---|---|---|---|---|
| **国内主流** | **抖音** | Native (双路线) | 主 API $\rightarrow$ 分享页 RouterData 提取 | 免登录 |
| | **哔哩哔哩** | Native (WBI 签名) | DASH 高清分轨 $\rightarrow$ MP4 兼容流 | 免登录 (1080P+ 需 Cookie) |
| | **小红书** | Native (State 提取) | InitialState $\rightarrow$ OpenGraph 兜底 | 免登录 (原图直出) |
| | **快手** | Native (GraphQL/HTML) | InitState $\rightarrow$ 正则备用匹配 | 免登录 |
| | **微博** | Native (访客 Session) | 自动访客 Cookie 交换 $\rightarrow$ 移动端 API | 免登录 (私密博文需 Cookie) |
| **国际平台** | **TikTok** | Native + Cobalt | WebApp 页面解析 $\rightarrow$ Cobalt 服务端点 | 免登录 |
| | **X (Twitter)** | Native + Cobalt | Syndication API $\rightarrow$ Cobalt 服务端点 | 免登录 |
| | **YouTube** | Native + Cobalt | Innertube API $\rightarrow$ Cobalt 服务端点 | 免登录 |
| | **Instagram** | Cobalt | 主实例 $\rightarrow$ 备用 Cobalt 节点轮询池 | 需配置 Cobalt 节点 |
| **扩展平台 (19 个)** | 汽水音乐、皮皮虾、西瓜视频、微视、最右、AcFun、新片场、好看视频等 | Worker Native 扩展解析器 | 单平台独立页面/公开数据流解析 | 免登录 |

> 注：平台真实可用性随上游接口迭代变化。可通过 `GET /api/v1/platforms` 获取当前节点的实时注册列表。

---

## 快速上手

### 环境要求

- [Node.js](https://nodejs.org/) 18.0+
- [npm](https://www.npmjs.com/) 9.0+
- [Cloudflare 账号](https://dash.cloudflare.com/)（仅在部署到云端时需要）

### 本地开发

```bash
# 1. 克隆代码仓库
git clone https://github.com/rowanjove/media-flow.git
cd media-flow

# 2. 安装项目依赖
npm install

# 3. 运行代码检查与单元测试
npm run lint
npm test

# 4. 构建前端并启动本地边缘环境
npm run build
npm run wrangler:dev
```

打开浏览器访问 `http://127.0.0.1:8787` 即可体验。

> Windows 用户可直接双击根目录下的 `start.bat` 或运行 `start.ps1`，脚本会自动检测依赖、构建静态资源并拉起服务。

---

## 生产部署 (Cloudflare Workers)

本项目采用 **Cloudflare Workers + Static Assets** 模式，前端静态页面与后端 API 部署于同一 Worker。

### 1. 登录 Cloudflare

```bash
npx wrangler login
```

### 2. 配置环境变量与密钥

管理后台凭证与可选平台 Cookie 必须作为 Secret 注入，**严禁提交至代码仓库**：

```bash
# 必须配置：管理端后台密钥（未配置会导致 /api/v1/admin/* 接口报 503）
npx wrangler secret put ADMIN_SECRET

# 可选配置：B站 1080P/4K 高清解析凭据
npx wrangler secret put BILIBILI_COOKIE

# 可选配置：抖音防风控增强 Cookie
npx wrangler secret put DOUYIN_COOKIE

# 可选配置：微博增强登录凭据
npx wrangler secret put WEIBO_COOKIE

# 可选配置：自建 Cobalt 实例 API Key
npx wrangler secret put COBALT_API_KEY
```

若使用外部或自建 Cobalt 实例解析国际平台，请在 `wrangler.jsonc` 中配置主地址与备用地址池：

```jsonc
{
  "vars": {
    "APP_NAME": "MediaFlow",
    "COBALT_PRIMARY_URL": "https://cobalt.yourdomain.com",
    "COBALT_FALLBACK_URLS": "https://cobalt-backup.yourdomain.com",
    "RATE_LIMIT_COUNT": "60",
    "RATE_LIMIT_WINDOW": "60"
  }
}
```

*详细密钥获取说明与 Cookie 提取格式，请参阅 [SECRETS.md](./SECRETS.md)。*

### 3. 一键编译与发布

```bash
npm run build
npx wrangler deploy
```

---

## API 规范

### 解析媒体链接

- **端点**：`POST /api/v1/parse`
- **请求头**：`Content-Type: application/json`
- **请求体**：
  ```json
  {
    "url": "https://v.douyin.com/xxxxxx/"
  }
  ```
- **响应示例**：
  ```json
  {
    "success": true,
    "requestId": "9c1483ef-d2c6-4b8b-b72e-8c38fe3ef730",
    "platform": "douyin",
    "author": {
      "name": "创作者昵称",
      "avatar": "https://p3.douyinpic.com/..."
    },
    "content": {
      "title": "视频标题与文案描述",
      "createdAt": 1710000000000
    },
    "media": [
      {
        "type": "video",
        "url": "https://aweme.snssdk.com/aweme/v1/play/...",
        "quality": "1080p",
        "bitrate": 2500000
      }
    ],
    "source": {
      "url": "https://v.douyin.com/xxxxxx/",
      "canonicalUrl": "https://www.douyin.com/video/..."
    }
  }
  ```

### 获取支持平台列表

- **端点**：`GET /api/v1/platforms`
- **响应示例**：
  ```json
  {
    "success": true,
    "platforms": [
      {
        "id": "douyin",
        "name": "抖音",
        "status": "stable",
        "features": { "video": true, "images": true, "audio": true }
      }
    ]
  }
  ```

---

## 隐藏运维后台

为保障轻量与防探测，前台默认不暴露任何后台管理入口：
1. 在网页任意位置按下快捷键 `Ctrl + Shift + .`（macOS 为 `Cmd + Shift + .`），或连续点击左上角 Logo 5 次；
2. 弹出密码框后输入 `ADMIN_SECRET`；
3. 验证通过后自动进入 `/console` 控制台，可查看实时请求吞吐、解析成功率、平台调用分布以及手动刷新全局缓存世代。

---

## 隐私、安全与合规声明

1. **零个人隐私收集**：本项目完全开源，不内置任何用户分析脚本、追踪代码、广告 SDK 或第三方收集器。
2. **凭据安全保护**：所有鉴权凭据与 Cookie 仅在 Cloudflare Worker 内部内存处理，不写入客户端浏览器，不输出至公开日志。
3. **合法合规使用**：本项目仅供个人开发学习、多媒体技术研究及个人公开媒体归档使用。使用本工具解析音视频请尊重原作者的版权与知识产权，严禁用于任何商业牟利、未经授权的大规模爬取或侵犯他人权益的用途。

---

## 开源协议

本项目采用 [Apache-2.0 License](./LICENSE) 协议开源。
涉及到的第三方协议与设计参考详见 [THIRD_PARTY_NOTICES.md](./THIRD_PARTY_NOTICES.md)。
