# 文件地图：按任务进入源码

先读 [README](../README.md)、[AGENTS](../AGENTS.md) 和 [架构说明](ARCHITECTURE.md)。机器可读索引为 [SOURCE_INDEX.json](SOURCE_INDEX.json)；大文件、图片及嵌图 JSON 不适合直接整文件塞入 Agent 上下文。

| 你准备修改 | 起点 | 后续检查边界 |
| --- | --- | --- |
| 首页、登录、导航 | `src/exam/web-host.mjs`、`web-header.mjs`、`web-design.css` | 不影响编辑器和已有资源状态 |
| 账号与个性化 | `src/exam/web-account-center.mjs`、`server/exam/auth.mjs`、`account-profiles.mjs` | 用户身份、图片归属、资料版本冲突 |
| 班级与小组 | `server/exam/groups.mjs`、`src/exam/web-groups.mjs` | 教师所有权与学生成员关系 |
| 模型连接 | `server/exam/ai-settings.mjs`、`src/exam/web-ai-settings.mjs` | 默认与班组覆盖、密钥保密、来源选择 |
| 学习任务 | `server/exam/assignments.mjs`、`src/exam/web-assignments.mjs` | 提交快照、状态与任务 AI 策略 |
| 题目与场景数据 | `src/exam/model.mjs`、`resources.mjs` | 数据格式、题目—场景层级、可移植导出 |
| 服务器资源 | `server/exam/resources.mjs`、`service.mjs`、`database.mjs` | 所有者、发布版本、附件与事务一致性 |
| 沙盒通信 | `src/exam/editor-client.mjs`、`bridge.mjs` | source/token/generation 与只读预览能力 |
| 平面运动求解 | `src/planar-physics.mjs`、`planar-model.mjs` | 单位、事件和模型约束 |
| 几何依赖 | `src/planar-relations.mjs`、`planar-geometry.mjs` | 连续依赖、无定义状态及恢复 |
| 场显示与点探针 | `src/planar-field-display.mjs`、`planar-field-probe.mjs` | 绘制与计算语义一致，避免混淆合场和单场 |
| 空间与补充模型 | `src/example4/`、`src/supplement/` | 独立运行时，不伪装为平面模型 |
| AI 编排 | `server/exam/ai-service.mjs`、`ai-agent-tools.mjs`、`ai-harness.mjs` | 用户请求范围、核验、候选确认、用量 |
| 文档读取 | `src/exam/documents.mjs`、`docx-parser.mjs`、`server/exam/ai-documents.mjs` | 原稿与候选分别处理，不补写不清晰条件 |
| 桌面适配 | `desktop/exam/main.mjs`、`preload.cjs`、`backend.mjs` | IPC、本机文件与网页模式隔离 |
| 公开入门示例 | `examples/getting-started.mjs`、`scripts/build-exam-sample.mjs` | 不含账号、附件或外部教材原稿 |
| 授权教学材料 | `assets/asset-register.json`、`teaching/README.md` | 许可来源、固定题设与算法代码分别登记 |
| 发布与元数据 | `scripts/build-exam-web.mjs`、`package-exam-web.mjs`、`release-metadata.mjs` | 产品版本、上游来源、源码 ZIP 无 Git 场景 |
| 文档导览 | `docs/guide/index.html`、`docs/overview.svg` | 离线可读、本地链接与 UTF-8 |

## 常见定位方式

```sh
rg -n "某个控件ID" src/exam
rg -n "某个接口路径" server/exam/http.mjs
rg -n "某个模型字段" src/planar-model.mjs src/planar-physics.mjs
rg --files tests
```

对 `src/guide-source.json`，先按 JSON 键选择需要的段落或图片元数据；不要把整份 base64 题图打印到终端。学习材料的来源登记见 [ASSET_LICENSES.md](../ASSET_LICENSES.md)，运行时数据不在公开源码中。

## 不应该混淆的版本

- 产品更新：`src/exam/release-notes.json` 的首项。
- 当前源码提交：自己仓库中的 Git HEAD。
- 上游来源：`PROVENANCE.json` 中 `upstream.commit`。
- 打包元数据：`build-manifest.json`，会区分已提交工作树、未提交工作树和不含 Git 的源码导出目录。
- 题目数据协议：如 `particle-exam/1`，不是软件发行版号，不因这次整理而随意修改。
