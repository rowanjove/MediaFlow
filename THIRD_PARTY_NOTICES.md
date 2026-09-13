# Third-Party Notices

本项目是独立实现。参考项目仅用于架构与解析思路，不把其源码整仓并入。

## parse.shenzjd.com

- 许可证：MIT（以原仓库为准）
- 采用：国内平台识别思路、Cookie 配置方式、媒体直链不中转；扩展平台公开接口/页面提取思路（皮皮虾、汽水音乐、西瓜、虎牙、AcFun 等）在 Worker 内重写
- 未采用：Next.js / OpenNext、按平台拆分的 API 路由

## douyinVd

- 许可证：MIT（以原仓库为准）
- 采用：抖音分享页 `_ROUTER_DATA` 备用解析思路
- 实现位置：`worker/providers/native/douyin/fallback.ts`

## mp4yt

- 许可证：原仓库根目录未见明确 LICENSE，因此只参考架构
- 采用：Astro 静态资源 + Worker API、顺序 Failover、SSRF 白名单思路
- 未复制其实现代码

## Cobalt

- 许可证：AGPL-3.0
- 采用：作为外部 HTTP Provider
- 禁止：复制 Cobalt API 源码进入本仓库

如后续确认并迁入了带版权声明的 MIT 代码片段，应在对应文件头保留原版权。
