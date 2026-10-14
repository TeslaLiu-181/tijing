# 第三方依赖与许可登记

本文件对应题景 v0.7.0 公开源码包，登记日期为 2026-10-14。项目代码的 MIT 许可不替代第三方包自带的许可证。教学材料另见 [资产与授权说明](ASSET_LICENSES.md)。

数据来自本包 [package.json](package.json) 与 [package-lock.json](package-lock.json)。完整机器可读清单见 [dependency-licenses.json](docs/dependency-licenses.json)。这里准确记录锁文件中的许可元数据，不声称已经逐项核验全部上游 LICENSE、NOTICE、字体许可或二进制组件许可。

## 直接依赖

| 包 | 锁定版本 | 用途类别 | 锁文件许可表达式 |
| --- | --- | --- | --- |
| @xmldom/xmldom | 0.9.12 | 运行依赖 | MIT |
| dompurify | 3.4.15 | 运行依赖 | (MPL-2.0 OR Apache-2.0) |
| electron | 44.4.2 | 开发依赖 | MIT |
| esbuild | 0.25.9 | 开发依赖 | MIT |
| fflate | 0.8.3 | 运行依赖 | MIT |
| katex | 0.16.22 | 运行依赖 | MIT |
| marked | 18.0.13 | 运行依赖 | MIT |
| mathlive | 0.111.0 | 运行依赖 | MIT |
| pdfjs-dist | 6.3.289 | 运行依赖 | Apache-2.0 |
| playwright | 1.58.2 | 开发依赖 | Apache-2.0 |
| sharp | 0.35.4 | 运行依赖 | Apache-2.0 |
| three | 0.180.0 | 运行依赖 | MIT |

## 统计与提取口径

- 排除 packages 中代表本项目的空路径根条目，保留其余 96 条包记录。
- 根据 package.json 的 dependencies / devDependencies 匹配顶层安装路径：9 个直接运行依赖、3 个直接开发依赖，另有 84 条传递记录。
- 锁文件标记 developmentOnly 的条目有 42 条，未作该标记的有 54 条；optional 有 69 条。optional 与开发/运行分类相互重叠，不能直接相加。
- 保留各平台的可选包；96 是锁文件条目数，不是当前平台安装数量。相同包的不同安装路径不合并。
- license 字段逐字保留，包括 AND、OR 与括号；缺失时才标为未声明。当前 96 条记录均有 license 元数据。
- operatingSystems、architectures、developmentOnly 和 optional 直接来自对应锁定条目，不反推平台或使用方式。

| 许可表达式 | 锁文件条目数 |
| --- | --- |
| (MPL-2.0 OR Apache-2.0) | 1 |
| 0BSD | 1 |
| Apache-2.0 | 18 |
| Apache-2.0 AND LGPL-3.0-or-later | 3 |
| Apache-2.0 AND LGPL-3.0-or-later AND MIT | 1 |
| BSD-2-Clause | 1 |
| ISC | 2 |
| LGPL-3.0-or-later | 10 |
| MIT | 59 |

## sharp 与平台二进制

sharp 本身的锁定许可为 Apache-2.0。以下传递平台包的锁文件包含 LGPL-3.0-or-later，部分为组合表达式；它们不能统一简写成 sharp 的 Apache-2.0，也不意味着整个本项目自动适用 LGPL。

| 平台包 | 锁定版本 | 锁文件许可表达式 |
| --- | --- | --- |
| @img/sharp-libvips-darwin-arm64 | 1.3.3 | LGPL-3.0-or-later |
| @img/sharp-libvips-darwin-x64 | 1.3.3 | LGPL-3.0-or-later |
| @img/sharp-libvips-linux-arm | 1.3.3 | LGPL-3.0-or-later |
| @img/sharp-libvips-linux-arm64 | 1.3.3 | LGPL-3.0-or-later |
| @img/sharp-libvips-linux-ppc64 | 1.3.3 | LGPL-3.0-or-later |
| @img/sharp-libvips-linux-riscv64 | 1.3.3 | LGPL-3.0-or-later |
| @img/sharp-libvips-linux-s390x | 1.3.3 | LGPL-3.0-or-later |
| @img/sharp-libvips-linux-x64 | 1.3.3 | LGPL-3.0-or-later |
| @img/sharp-libvips-linuxmusl-arm64 | 1.3.3 | LGPL-3.0-or-later |
| @img/sharp-libvips-linuxmusl-x64 | 1.3.3 | LGPL-3.0-or-later |
| @img/sharp-wasm32 | 0.35.4 | Apache-2.0 AND LGPL-3.0-or-later AND MIT |
| @img/sharp-win32-arm64 | 0.35.4 | Apache-2.0 AND LGPL-3.0-or-later |
| @img/sharp-win32-ia32 | 0.35.4 | Apache-2.0 AND LGPL-3.0-or-later |
| @img/sharp-win32-x64 | 0.35.4 | Apache-2.0 AND LGPL-3.0-or-later |

本公开包以源码及锁文件交付，不随包拷贝 node_modules。接收者通过 npm ci 安装适合自己的平台依赖。若另外发布包含这些包、原生库或字体的安装包、容器或静态构建，应针对实际携带版本附带其许可证、版权声明及要求的其他材料；本表不替代那些上游原文。

## 构建产物中的第三方内容

Web 与离线构建会使用或嵌入 KaTeX、MathLive、PDF.js、Three.js 等组件及相关字体/资源。现有单文件构建脚本会保留部分库的许可证文本；不能仅据这一点宣称所有输出的告知义务均已覆盖。发布新增构建产物时，应以输出实际包含的包和该版本上游 LICENSE/NOTICE 为准。

## npm 清单之外的运行依赖

Node.js 运行时以及服务器文档读取调用的 Poppler 命令（pdfinfo、pdftotext、pdftoppm）和 antiword 不属于 package-lock.json 的 npm 包条目，本清单未给它们猜填版本或许可证。本源码包不捆绑这些系统程序；安装或另行分发时，应以所选发行版本附带的许可证和版权文件为准。96 条 npm 记录不能当作整个运行环境的软件数量。

## 更新方式

修改依赖后，以新的锁文件重新生成 docs/dependency-licenses.json，并同步本页直接依赖表、统计和平台包表。不要手改 SPDX 表达式，也不要把上游未知信息猜写为 MIT。

## 随附许可正文

[docs/licenses/](docs/licenses/README.md) 保留了整理环境中已安装依赖的 33 份许可／版权文件原文；不是全部平台可选包的实现或运行时。生成 Web 与桌面运行包时会一并复制这些声明，PDF.js 资源内自带的字体与 CMap 声明随相应目录保留。
