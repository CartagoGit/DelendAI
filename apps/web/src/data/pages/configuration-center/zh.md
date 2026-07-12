---
title: 配置中心
description: 在 VS Code 中安全配置 mcp-vertex 插件并查看产物归属。
order: 2
navLabel: 配置
---

# 配置中心

在 VS Code 中运行 **MCP Vertex: Open Configuration Center**；多根窗口中先选择项目。页面展示常规设置、插件、提供商、智能体、技能、提示词、资源和知识，以及各自的所有者和来源。

## 安全编辑

配置中心只修改 `mcp-vertex.config.json`。服务器命令、参数、前缀、主题和语言仍属于 VS Code 偏好。保存会核对文件摘要，只合并修改路径，验证完整文档并原子替换文件。未知字段和已禁用的外部服务器不会丢失。发生冲突时请重新加载后再应用修改。

密钥值会隐藏；`env` 只能包含环境变量名。修改后请重启服务器。

## 插件作者

请在验证 `ctx.options` 的同一个 `definePlugin(...)` 中提供 `optionsSchema`，并让 `configExample.options` 通过该架构。通过 `plugins.<id>.path` 声明的本地插件和外部 MCP 子项会自动显示架构与来源。
