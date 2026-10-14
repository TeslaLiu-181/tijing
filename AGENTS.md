# Agent 协作指南

本文件面向首次进入仓库的编码 Agent 和维护者。先理解任务范围，再沿现有模块修改；不把读取整个仓库或运行全部测试当成每次任务的起点。

## 先读哪里

1. [README.md](README.md)：产品定位、功能、快速启动和授权说明。
2. [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)：模块关系、数据流、权限与沙盒边界。
3. [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md)：任务到文件的映射、构建和有针对性的验证。
4. 涉及安装、环境或发布时，再读 [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)。

当前公开版为 **v0.7.0**。`src/exam/release-notes.json` 首项是产品更新记录，`package.json` 和发布包版本应与它一致。不要用旧交付文档中的服务器状态判断当前部署版本。

## 仓库速查

| 任务 | 优先入口 |
| --- | --- |
| 网页登录、首页、导航和移动布局 | `src/exam/web-host.mjs`、`web-header.mjs`、`mobile.mjs`、`web-*.css` |
| 账号、教师注册、资料图片 | `server/exam/auth.mjs`、`account-permissions.mjs`、`account-profiles.mjs`；`src/exam/web-account-center.mjs` |
| 班级、小组和教师 API | `server/exam/groups.mjs`、`ai-settings.mjs`；`src/exam/web-groups.mjs`、`web-ai-settings.mjs` |
| 工作台、题目与场景保存 | `src/exam/app.mjs`、`model.mjs`；`server/exam/resources.mjs`、`service.mjs` |
| 平面粒子运动、场域与几何依赖 | `src/planar-physics.mjs`、`planar-model.mjs`、`planar-relations.mjs`、`planar-geometry.mjs` |
| 沙盒 UI、参数和图表 | `src/planar-app.mjs` 及对应 `planar-*.mjs` / `.css` |
| 工作台与 iframe 通信 | `src/exam/editor-client.mjs`、`bridge.mjs` |
| AI 提取、答疑、场景候选和核验 | `server/exam/ai-service.mjs`、`ai-agent-tools.mjs`、`ai-harness.mjs` 及相邻 worker |
| 文档导入与资源导出 | `src/exam/documents.mjs`、`docx-parser.mjs`、`resources.mjs`；`desktop/exam/backend.mjs` |
| 静态构建与运行包 | `scripts/build-exam-web.mjs`、`build-exam.mjs`、`package-exam-web.mjs` |
| 发布说明 | `src/exam/release-notes.json`、`src/exam/web-updates.mjs` |

## 开始工作

- 优先中文交流；先说清预期效果、修改范围和验收点。用户已给出明确方案或要求直接做时，继续执行，不反复确认。
- 先查看 `git status`、相关文件和调用关系；保留已有未提交修改。用 `rg` 定位，不无目的地遍历私密数据目录。
- 复用 ES modules、原生浏览器 UI、Node HTTP 和已有模型；不要为局部改动新增大型框架或平行数据层。
- 业务代码和打包入口都从源码修改；`dist/`、依赖目录和构建生成的 HTML 由脚本再生成，不直接修补压缩产物。
- 注释说明业务规则和不直观的原因，不逐行翻译代码。中文文件使用 UTF-8。

## 不可破坏的边界

### 身份与资源

- 平台管理权限来自数据库中的 `platform_admin`，不是前端传入的角色。自助注册教师只拥有自己的教学空间。
- 教师只能管理自己负责的班级、小组和相应学生。单纯的小组成员关系不授予重置学生账号的权限。
- 学生私人原稿、教师私人资源和其他人的 API 密钥不因访问者是教师就变成可读。
- 资源发布产生快照；作者修改私人草稿不能同步改写已发布快照。保留版本检查和并发冲突处理。
- 上传图片须继续由服务器解码并重新编码；客户端声明的 MIME、文件名、归属和图片编号不作为信任依据。

### 数据和密钥

- `.env`、运行数据库、会话、用户上传附件、头像、封面、AI 配置和备份不得提交或加入公开包。
- `EXAM_DATA_DIR` 是持久数据的边界；不要把新代码目录当成数据迁移目标，不要在生产数据上运行开发脚本。
- 密钥只留在服务器。前端使用脱敏配置；新教师不继承其他教师的连接，班组专属配置不可用时不得静默换用另一密钥。
- 改动数据库结构前先理解现有启动迁移；升级和回退必须考虑数据库与文件附件的共同状态。
- 修改模型网络层时保留 HTTPS、公共地址与重定向限制，不能为一次连接失败放开任意内网地址访问。

### iframe 与 AI

- 网页场景由仓库提供的可信运行时加载 JSON 快照。不要执行导入题目或 AI 返回的 HTML / JavaScript。
- 保留 iframe 的 `event.source`、token、generation 和能力白名单检查，避免切题后旧消息覆盖新场景。
- 网页 iframe 不随意增加 `allow-same-origin`；桌面端的独立设置不能照搬到网页端。
- 只读 AI 候选预览不保存资源、不开放编辑能力。应用候选仍使用服务器核验过的结果及资源版本检查。
- 任务的“禁止 AI / 仅提示”等规则不能被个人 API 绕过。AI 场景生成范围目前是原生平面模型，不能把三维模型暗中转换成平面。
- 微信接入默认关闭。代码存在不等于官方登录已可用；官方应用、回调域、凭证和真实联调完成前保留待配置状态。

### 物理与教学

- 区分题设、推导关系、演示取值和观察状态。演示参数不能冒充原题条件。
- 参数改变时保持定义关系与连续依赖，不能只在初始数值上凑出相等关系。
- 遵守现有单位转换、模型校验和物理求解入口；改变时间尺度时同步考虑观察时段与轨迹显示。
- 显示、颜色、标签和导航改动尽量局限于 UI；不要为了消除重叠或布局问题删除物理对象或关闭全部标签。
- 保留既有教学材料与来源信息。公开版的代码采用 MIT；教学材料的署名及授权细则以发布说明为准，不能把代码许可自动扩展到第三方材料。

## 验证与交付

先执行与当前修改直接相关的检查。文档修改核对路径、命令和链接；构建修改核对构建与产物；权限或模型修改选择对应已有测试。用户要求暂不运行功能测试时，不擅自启动长时间回归或真实模型调用，并明确哪些内容未验证。

常用命令：

```sh
npm run build:web
npm run check:runtime
node scripts/check-release-notes.mjs
```

`check:runtime` 检查本机 Node、静态资源和文档处理工具，不代表业务验收。它会加载 Sharp；缺少 PDF / DOC 命令时返回失败，不应把失败描述成整个网站不可运行。其他定向验证见 [开发指南](docs/DEVELOPMENT.md)。

交付说明应包含：改动内容、涉及文件、实际运行过的检查、结果和已知限制。提交代码、生成发布包、上传远端和切换线上服务是不同状态，分别说明。发布操作必须在已授权的目标环境内进行。
