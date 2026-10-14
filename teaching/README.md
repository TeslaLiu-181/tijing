# 已授权教学材料与制作流程

本目录保留上游专题教学场景、答案与补充模型。项目维护者已确认其具备公开再分发授权；材料本身的出处、权利人和具体使用范围在 [资产登记表](../ASSET_LICENSES.md) 中补充，不能自动视为 MIT。

`holiday-20261006/` 是一个可选的专题制作流程，不属于全栈网站启动依赖。原始 DOCX 及 `.qa` 中间产物不随源码包分发，请自行提供有权使用的文档目录。

从仓库根目录按顺序执行：

```sh
node teaching/holiday-20261006/extract.mjs --source-dir=/path/to/authorized-docx
python teaching/holiday-20261006/image-sizes.py --source-dir=/path/to/authorized-docx
node teaching/holiday-20261006/pair-sources.mjs
node teaching/holiday-20261006/build.mjs --source-dir=/path/to/authorized-docx --supplement
```

Windows 目录含空格时给整个 `--source-dir=...` 参数加引号。脚本仍按该专题的题号与作业文件命名匹配内容，不能当作任意教材的通用自动解析器。中间文件写入 `.qa/holiday-20261006/`，结果写入 `dist/`，两者均不进入 Git 或源码交付包。

已有 `assets/guide/`、`src/guide-source.json` 及各专题代码内的题目文字保留原样；本次只把个人绝对目录改为参数。
