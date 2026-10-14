# 可公开的入门示例

`getting-started.mjs` 是本次整理新编的三个观察任务，使用通用磁场、电场和速度选择器模板，无附件、无学生数据、无 API 密钥，采用项目代码的 MIT 许可。

```sh
npm run build:sample
```

生成 `dist/exam/sample.tijingexam` 和可供阅读的 `dist/exam/sample.json`。`npm run build:web` 自动执行此步骤；登录首页的“体验入门示例”读取该文件。

所有数字来自模板中的演示设定。任务提示不把演示值冒充外部试题条件，资源仍允许教师校对和改编。

已有授权专题教学内容继续保留在源码中。需要把自己的专题 DOCX 生成旧示例时，执行 `npm run build:textbook-sample -- /path/to/authorized.docx`，它会覆盖默认示例输出；发布前核实所提供原稿的再分发范围。
