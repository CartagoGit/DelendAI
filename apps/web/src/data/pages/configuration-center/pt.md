---
title: Central de configuração
description: Configure plugins do mcp-vertex e consulte a origem dos artefatos com segurança no VS Code.
order: 2
navLabel: Configuração
---

# Central de configuração

Execute **MCP Vertex: Open Configuration Center** no VS Code e escolha o projeto em janelas multi-root. As seções mostram ajustes gerais, plugins, provedores, agentes, skills, prompts, recursos e conhecimento com proprietário e origem.

## Edição segura

Somente `mcp-vertex.config.json` é alterado; comando, argumentos, prefixo, tema e idioma continuam nas preferências do VS Code. O salvamento verifica o hash, mescla apenas os caminhos editados, valida o documento inteiro e substitui o arquivo atomicamente. Campos desconhecidos e servidores externos desativados são preservados. Em conflito, recarregue e reaplique a mudança.

Segredos ficam ocultos; `env` contém apenas nomes de variáveis. Reinicie o servidor após alterações.

## Autores de plugins

Publique `optionsSchema` no mesmo `definePlugin(...)` que valida `ctx.options` e mantenha `configExample.options` válido. Plugins locais via `plugins.<id>.path` e filhos MCP externos aparecem automaticamente com esquema e origem.
