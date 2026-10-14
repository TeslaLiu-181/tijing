# Deployment · 安装、部署、备份与升级

[返回 README](../README.md) · [架构](ARCHITECTURE.md) · [开发](DEVELOPMENT.md)

本文提供公开版 v0.7.0 的独立安装流程。所有示例域名、服务账号和目录都是部署示例；请为自己的实例选择相应配置。分发包不包含预置密码、API 密钥或已有师生数据库。

## 1. 环境要求

| 项目 | 要求 / 用途 |
| --- | --- |
| Node.js | **24.14 ≤ 版本 < 25**，包含项目使用的 `node:sqlite` |
| npm | 随上述 Node 安装，用锁文件安装依赖 |
| 系统 | 网页服务可在 Windows 或 Linux 运行；桌面便携打包脚本限定 Windows x64 |
| 浏览器 | 使用近期 Chrome / Edge；PDF 构建目标为 Chromium 136，旧浏览器不作为完整文档功能基线 |
| Sharp | npm 图像处理依赖，安装时需要对应平台的原生二进制 |
| Poppler | `pdfinfo`、`pdftotext`、`pdftoppm`，用于服务器侧 PDF 处理 |
| antiword | 旧 `.doc` 资料处理；普通 DOCX 解析不依赖此命令 |
| 外网 | 安装依赖需要访问 npm；使用 AI 需由服务器访问配置的模型 HTTPS 服务 |

SQLite 由 Node 内建模块提供，不需要安装 MySQL、PostgreSQL 或独立 SQLite 服务。浏览器端普通资源管理、手工场景和账号功能不要求模型 API。

`npm run check:runtime` 会严格检查 Node、Sharp、worker、构建资产和全部上述文档工具。缺少 PDF / DOC 工具时会返回失败；网站基础功能仍可能启动，但相应文档链路不能宣称完整可用。

## 2. Windows：从源码启动

在解压后的仓库根目录打开 PowerShell。目录中应有 `package.json`。

```powershell
node --version
npm --version
npm ci
npm run build:web
Copy-Item -LiteralPath server/exam/.env.example -Destination .env
```

如果只运行网页，安装依赖前可以跳过 Electron 二进制下载，节省桌面运行时的下载量。此时仍需开发依赖中的 esbuild，**不要在源码构建前使用 `--omit=dev`**。

```powershell
$env:ELECTRON_SKIP_BINARY_DOWNLOAD = "1"
npm ci
Remove-Item Env:ELECTRON_SKIP_BINARY_DOWNLOAD
```

这组命令替代前面的 `npm ci`，不需要安装两次。日后启用桌面运行时，确保未设置该变量，再运行 `npm rebuild electron`。

打开自己刚创建的 `.env`，本机体验可保留以下值：

```dotenv
EXAM_HOST=127.0.0.1
EXAM_PORT=8080
EXAM_PUBLIC_URL=http://127.0.0.1:8080
EXAM_CLASS_NAME=物理学习空间
EXAM_USER_QUOTA_MB=500
EXAM_MAX_RESOURCES=200
EXAM_WECHAT_ENABLED=0
```

然后初始化首位教师账号并启动：

```powershell
npm run setup
npm start
```

按提示输入登录账号、昵称和密码。账号为 3–32 位字母、数字、点、下划线或短横线；密码长度为 8–128 个字符。初始化需要交互终端，密码不会写入公开文件。服务首次启动时，初始负责教师成为平台管理员；其后自助注册的教师拥有独立空间，不自动获得管理员权限。

访问 [http://127.0.0.1:8080](http://127.0.0.1:8080)。`npm run setup:web` 与 `npm run start:web` 是同义入口。停止前台进程使用 `Ctrl+C`。只运行初始化不会启动 HTTP 服务。

需要完整文档功能时，在 Windows 安装 Poppler 和 antiword，把各自可执行文件目录加入启动服务时的 `PATH`。重新打开终端后检查：

```powershell
Get-Command pdfinfo,pdftotext,pdftoppm,antiword
npm run check:runtime
```

项目没有捆绑这些系统工具，也不自动修改系统 `PATH`。不要把开发机上其他软件附带的临时路径写进公开配置。

## 3. Linux：从源码启动

以下系统依赖命令适用于 Debian / Ubuntu。Node 24 应先按自己的系统管理方式安装；不要假定发行版默认 `nodejs` 包满足版本范围。

```sh
node --version
npm --version
sudo apt-get update
sudo apt-get install -y poppler-utils antiword
```

进入仓库根目录：

```sh
ELECTRON_SKIP_BINARY_DOWNLOAD=1 npm ci
npm run build:web
cp server/exam/.env.example .env
chmod 600 .env
```

编辑 `.env`，然后运行：

```sh
npm run setup
npm run check:runtime
npm start
```

源码构建不要求 Playwright 浏览器下载，网页服务不需要图形桌面。`build:web` 自动构建各沙盒与工作台，并生成无私人附件的原创示例。

## 4. 配置要点

配置模板见 [`server/exam/.env.example`](../server/exam/.env.example)。复制模板后只在本机编辑真实值。

| 变量 | 默认 / 作用 |
| --- | --- |
| `EXAM_HOST` | `127.0.0.1`，监听地址；使用同机反向代理时保留 |
| `EXAM_PORT` | `8080`，Node 服务端口 |
| `EXAM_PUBLIC_URL` | 用户实际访问的根地址，不含子路径、查询串和片段 |
| `EXAM_DATA_DIR` | 默认源码或运行包下的 `data/exam-web`；长期部署建议设为独立绝对路径 |
| `EXAM_CLASS_NAME` | 初始学习空间名称，已有数据库设置不会每次被环境变量覆盖 |
| `EXAM_USER_QUOTA_MB` | 每用户附件容量，默认 500 MB |
| `EXAM_MAX_RESOURCES` | 每用户资源数量上限，默认 200 |
| `EXAM_WECHAT_ENABLED` | 默认 `0`；没有官方条件时保持关闭 |

**访问地址必须一致。** 浏览器以 `localhost` 打开而配置为 `127.0.0.1`，或切换到 HTTPS 域名却未更新 `EXAM_PUBLIC_URL`，可能触发来源校验失败。填写最终对用户开放的根地址，并通过同一地址访问。

长期部署示例：

```dotenv
EXAM_HOST=127.0.0.1
EXAM_PORT=8080
EXAM_PUBLIC_URL=https://physics.example.org
EXAM_DATA_DIR=/srv/tijing-data
EXAM_CLASS_NAME=物理探究课堂
EXAM_WECHAT_ENABLED=0
```

此处 `physics.example.org` 为占位域名，需要替换为自己的可用域名和证书。Windows 的持久目录可写为 `C:/tijing-data`。服务账号必须能读公开代码、执行系统工具，并读写持久目录；私密配置只向该账号开放读取。

对于自动化首次安装，代码也支持 `EXAM_ADMIN_USERNAME` / `EXAM_ADMIN_PASSWORD`，只在没有教师时用于初始化。真实密码仅通过部署系统的秘密配置注入，完成后移除；不要放入命令示例、Git 或交付压缩包。普通安装推荐交互 `npm run setup`。

## 5. 独立运行包

在源码目录完成构建后，生成一个**尚不存在**的输出目录：

```sh
npm run build:web
npm run package:web -- --out=dist/release-v0.7.0
```

输出包含后端及 worker、`dist/exam` 静态资源、运行依赖声明与锁文件、启动脚本、说明和 `build-manifest.json`。不包含安装者的数据库、账号、模型密钥和 `.env`。在新目录名中生成下一版本，不覆盖旧运行包。

在目标机的运行包根目录执行：

```sh
npm ci --omit=dev
```

运行包根目录的配置模板是 `.env.example`。Windows：

```powershell
Copy-Item -LiteralPath .env.example -Destination .env
npm run setup
npm start
```

Linux：

```sh
cp .env.example .env
chmod 600 .env
npm run setup
npm start
```

运行包安装 `--omit=dev` 是正确的，因为这里已经不再需要 esbuild。运行依赖应在目标系统安装，尤其不要把 Windows 的 `node_modules` 复制到 Linux。

`启动学习空间.cmd`、`start.sh` 是运行包根目录启动入口，会尝试创建 `.env`、安装缺少的依赖并进入初始化/启动。仓库 `server/exam/` 中的同名文件是打包模板，不是供人在那个子目录直接执行的源码启动脚本。

## 6. Linux 后台服务与 HTTPS

下面是可按自身目录调整的 systemd 配置示例。先完成运行包安装、服务账号创建、目录权限和账号初始化，再启动服务。

建议将公开程序放在 `/srv/tijing-app/current`，私密数据放在 `/srv/tijing-data`，配置放在 `/etc/tijing-app.env`。示例服务账号为 `tijing-app`；程序目录对服务账号只读，数据目录由其读写，配置文件由 root 保管并允许服务账号组读取。

```ini
[Unit]
Description=Tijing physics learning workspace
After=network.target

[Service]
Type=simple
User=tijing-app
Group=tijing-app
WorkingDirectory=/srv/tijing-app/current
EnvironmentFile=/etc/tijing-app.env
ExecStart=/usr/bin/node server/exam/main.mjs
Restart=on-failure
RestartSec=3
UMask=0077

[Install]
WantedBy=multi-user.target
```

将 `/usr/bin/node` 改为实际 Node 24 路径。systemd 不一定继承交互终端的 nvm、PATH 或环境配置；PDF/DOC 命令也必须在服务可用的 PATH 中。服务示例没有把密钥写入 unit。

用服务账号对同一配置初始化，避免产生归属错误的数据：

```sh
sudo -u tijing-app /usr/bin/node --env-file=/etc/tijing-app.env /srv/tijing-app/current/server/exam/setup.mjs
```

unit 保存为 `tijing-app.service` 并安装到系统 unit 目录后：

```sh
sudo systemctl daemon-reload
sudo systemctl enable --now tijing-app
sudo systemctl status tijing-app --no-pager
sudo journalctl -u tijing-app -n 60 --no-pager
```

HTTPS 放在反向代理层，Node 保持本机监听。以 Caddy 形式表示，最小代理关系为：

```caddyfile
physics.example.org {
    reverse_proxy 127.0.0.1:8080
}
```

域名解析、证书和代理安装由部署环境管理。浏览器入口与 `EXAM_PUBLIC_URL` 必须一致；代理应支持 AI 流式响应和较长请求，避免缓存 `/api/` 或把流式响应一直缓冲到结束。不要把示例服务配置直接覆盖到已有实例，先保留其服务账号、数据路径和代理规则。

## 7. 模型连接与微信

教师登录后在“API 连接设置”配置自己的教学连接，并按需为班级或小组覆盖。学生可选有资格使用的教学连接或自己的个人连接。只保存配置不会调用模型；“测试连接”和实际 AI 请求会访问所选服务并可能消耗其额度。

API 服务地址必须满足代码中的 HTTPS 和公共网络校验；重定向、localhost 或内部网络地址会被拒绝。当前公开版不能把 `http://localhost:...` 直接当作模型入口。修改模型网络策略属于单独设计事项。

微信保持 `EXAM_WECHAT_ENABLED=0`。启用前需具备自己的已审核网站应用、登录能力、匹配的回调域和凭证；回调路径固定为 `/api/auth/wechat/callback`，必须与 `EXAM_PUBLIC_URL` 同源。真实 AppSecret 只进入受限配置。完成实际扫码注册、绑定、退出登录、解除绑定与异常场景联调后，才能对用户宣布可用。详见 [微信登录接入说明](manuals/微信登录接入说明.md)。

## 8. 首次使用顺序

1. 管理员登录，按需修改空间设置。
2. 其他教师选择“教师注册”，建立各自教学空间。
3. 教师创建行政班，将该班邀请码交给自己的学生；学生使用“学生注册”。
4. 教师可建立学习小组，配置教学连接；无 API 时也可以使用手工沙盒与资源工作台。
5. 使用原创示例理解题目、场景、发布与副本；再导入自己准备的材料。

没有默认通用密码，也不需要把别人的教学实例数据库导入本机。

## 9. 备份、升级与回退

备份单位是**持久数据目录 + 私密配置 + 对应代码版本**。数据库使用 SQLite WAL；运行时仅复制 `workspace.sqlite` 可能遗漏未合并的数据，附件和模型配置也不在该单文件里。

对于普通单实例，简明可靠的做法是安排短暂停服：停止服务，完整复制 `EXAM_DATA_DIR` 和 `.env` / 环境配置，记录旧程序版本，再恢复服务。备份放在公开源码、网站静态目录和共享压缩包之外，并限制读取权限。

Linux 示例使用前述部署目录：

```sh
sudo systemctl stop tijing-app
sudo install -d -m 700 /var/backups/tijing-app
sudo sh -c 'umask 077; tar -czf "/var/backups/tijing-app/backup-$(date +%Y%m%d-%H%M%S).tar.gz" -C /srv tijing-data -C /etc tijing-app.env'
sudo systemctl start tijing-app
```

Windows 前台实例先用 `Ctrl+C` 完整停止，再通过文件管理器或 `Copy-Item -LiteralPath ... -Recurse` 复制真实持久目录和配置到新备份目录。不要在未核对路径时移动或删除原目录；不要让两个进程使用同一个持久目录。

升级顺序：

1. 新版本在独立目录安装依赖并构建/解压，不覆盖旧程序。
2. 阅读更新说明，确认 Node、依赖、配置和数据结构要求。
3. 停服并备份当前数据及配置，保留旧运行包。
4. 新版本继续指向同一 `EXAM_DATA_DIR`，使用同一对外 URL 和受限配置。
5. 启动后确认进程、版本及本次变更的必要入口；观察服务日志。

回退前要判断新版本是否已迁移数据库。仅切换程序目录不一定兼容已变化的数据；需要数据回退时，使用与旧程序配套的停服备份，明确升级以后新产生的数据将不在旧快照中。不要同时启动新旧服务来验证同一数据目录。

## 10. 常见问题

| 现象 | 优先检查 |
| --- | --- |
| 提示尚未设置教师 | 对当前 `.env` 和持久目录运行 `npm run setup` |
| 登录/保存提示请求来源不正确 | 浏览器地址是否与 `EXAM_PUBLIC_URL` 完全匹配，特别是协议、域名与端口 |
| 打开页面缺少脚本或沙盒 | 是否执行 `build:web`，运行目录中 `dist/exam` 是否完整可读 |
| “打开示例”失败 | 是否使用当前构建流程生成 `sample.tijingexam`，是否误用了旧构建残留 |
| `node:sqlite` 或模块功能不可用 | Node 是否在规定的 24.x 范围，服务与终端是否调用同一 Node |
| PDF / DOC 处理失败 | 服务账号能否找到 Poppler / antiword，是否缺少 PATH 或文件权限 |
| Sharp 加载失败 | 是否在当前系统重新 `npm ci`，是否复制了其他系统的原生依赖 |
| 数据目录已被另一服务使用 | 是否有未停止进程；不要在进程运行时删除 `server.lock` |
| API 连接保存了但不能调用 | 教师是否停用、班组成员资格是否有效、服务地址和密钥是否匹配 |
| 微信显示待开通 | 这是默认状态；检查官方资质和完整配置，不使用模拟身份绕过 |
