---
title: Catalogar a documentação do projeto
plugin: docs
audience: qualquer agente que precise encontrar um doc por tópico
order: 1
lang: pt
---

# Catalogar a documentação do projeto

O plugin `docs` responde a uma pergunta pequena e frequente: "quais docs
este projeto tem, e qual estou procurando?" Em vez de fazer grep, o
agente pergunta ao plugin. Este tutorial mostra como ativar, listar e ler.

## 0. O modelo mental

Um **doc** é qualquer arquivo `.md` sob as `roots` configuradas. O
plugin os enumera uma vez, extrai o título (do primeiro `# heading`
ou frontmatter `title:`), e serve um índice de baixo token. O body é
buscado apenas sob demanda.

A configuração fica em `mcp-vertex.config.json`:

```jsonc
{
  "plugins": {
    "docs": {
      "options": {
        "roots": ["docs", "README.md", "CHANGELOG.md", "AGENTS.md"]
      }
    }
  }
}
```

`roots` é um array de caminhos (arquivos ou diretórios). Diretórios
são percorridos recursivamente. **Caminhos fora do workspace são
recusados** — sem travessia `..`.

## 1. Listar (índice de baixo token)

```json
{ "tool": "docs_list", "args": {} }
```

Resposta (truncada):

```json
{
  "count": 18,
  "truncated": false,
  "docs": [
    { "path": "README.md", "title": "@mcp-vertex/core" },
    { "path": "docs/ARCHITECTURE.md", "title": "Architecture" },
    { "path": "docs/proposals/l100-…md", "title": "l100 — Web: i18n real…" },
    { "path": "CHANGELOG.md", "title": "Changelog" }
  ]
}
```

A lista é ordenada por caminho. Passe `roots` para limitar a lista a
um subconjunto (ex. apenas `["docs/proposals"]`):

```json
{
  "tool": "docs_list",
  "args": { "roots": ["docs/proposals"] }
}
```

## 2. Ler um doc

```json
{
  "tool": "docs_read",
  "args": { "path": "docs/ARCHITECTURE.md" }
}
```

Resposta:

```json
{
  "path": "docs/ARCHITECTURE.md",
  "title": "Architecture",
  "content": "# Architecture\n\n…corpo completo…",
  "truncated": false,
  "found": true
}
```

`content` é limitado a 256 KiB. Se o doc for maior, `truncated: true`
e o body são os primeiros 256 KiB. Se o caminho não corresponder a
nenhum doc sob as roots configuradas, `found: false`.

## 3. Por que dois tools e não um

`list` é barato (alguns centenas de bytes por doc, 18 docs ≈ 4 KiB).
`read` é caro (potencialmente megabytes por doc). Separá-los permite ao
agente fazer `list` primeiro, depois `read` apenas os relevantes —
economizando tokens em cada etapa de descoberta.

## 4. Contenção de caminho (segurança)

`docs_read` resolve o caminho com `resolveWorkspaceContained` — caminhos
absolutos, travessia `..`, e symlinks apontando fora do workspace são
todos recusados. A resposta `found: false` é o sinal do agente de que
o caminho foi rejeitado; o plugin não distingue intencionalmente
"ausente" de "fora do workspace" (para evitar vazar o layout do
sistema de arquivos).

## Erros frequentes

- **Root não existe**: `docs_list` retorna `{ count: 0,
  truncated: false, docs: [] }`. O plugin não avisa.
- **Doc ainda não commitado**: arquivos não rastreados ainda são
  servidos (o plugin lê do sistema de arquivos, não do git). O `path`
  retornado é relativo ao workspace.
- **Inferência de título falha**: se o primeiro heading não é `# ` (sem
  espaço, nível errado) e não há frontmatter `title:`, o plugin usa
  o basename do arquivo (ex. `CHANGELOG.md` → `CHANGELOG.md`).
  Execute novamente após corrigir o heading.

## Próximo passo

- [Como `docs_list` se integra com `memory_recall` para "o que salvei + onde estava documentado?"](#)
- [Curando um índice de conhecimento com o plugin `knowledge`](#)
