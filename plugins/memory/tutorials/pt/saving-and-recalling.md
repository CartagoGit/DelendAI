---
title: Salvar e recuperar notas de memória
plugin: memory
audience: qualquer agente que precisa de continuidade entre sessões
order: 1
lang: pt
---

# Salvar e recuperar notas de memória

Este tutorial mostra as quatro ferramentas `memory_*` em ação. As notas
são pequenos registros JSON em `.cache/mcp-vertex/memory/notes.json`
— pequenos o suficiente para despejar na íntegra, indexados por id,
recuperáveis por tag ou consulta de texto completo.

## 0. O modelo mental

Uma **nota** é `{ id, title, body, tags, createdAt, updatedAt }`.
Os títulos são únicos (sem distinção de maiúsculas/minúsculas) —
`memory_save` faz upsert por título. Não há esquema para `body`;
trate-o como um campo de texto livre curto. Segredos são auto-removidos
por `redactSecrets` antes de a nota ser persistida (ver
`packages/core/src/lib/shared/redact.ts`).

## 1. Salvar uma nota

```json
{
  "tool": "memory_save",
  "args": {
    "title": "ordem de publicação do monorepo",
    "body": "core primeiro, depois plugins em sincronia. derive-version.ts lê Conventional Commits desde a última tag vX.Y.Z.",
    "tags": ["release", "monorepo"]
  }
}
```

Resposta: `{ id: "<uuid>", createdAt: "..." }`. Save retorna o id
para que você possa `esquecer` depois.

## 2. Recuperar por consulta

```json
{
  "tool": "memory_recall",
  "args": {
    "query": "ordem de publicação",
    "limit": 5
  }
}
```

Retorna até `limit` notas que correspondem à consulta (correspondência
de substring em título + body, classificadas por recência). Use `tags`
em vez de (ou junto com) `query` para restringir:

```json
{
  "tool": "memory_recall",
  "args": { "tags": ["release"], "limit": 10 }
}
```

## 3. Listar de forma econômica

`memory_list` retorna apenas `{ id, title, tags }` — o índice. Use
quando não quiser buscar os bodies ainda:

```json
{ "tool": "memory_list", "args": { "limit": 50 } }
```

## 4. Esquecer

```json
{ "tool": "memory_forget", "args": { "id": "<uuid>" } }
```

`memory_forget` é exclusão definitiva — não há exclusão suave / arquivo.
O id desaparece; o título fica livre para um futuro `memory_save`.

## Erros frequentes

- **Segredos em `body`**: mesmo que o plugin remova na gravação, não
  cole tokens brutos ou valores no estilo `.env` — a remoção é
  heurística, não perfeita.
- **Colisões de título**: `memory_save` faz upsert por título. Se dois
  agentes salvam o mesmo título em paralelo, o segundo escritor vence
  e o primeiro é perdido. Use títulos únicos por slice / por problema.
- **Recall retorna muitos resultados**: prefira `tags` a uma `query`
  ampla. Uma query de `""` retorna tudo ordenado por recência — útil
  para "o que salvei na última sessão?" mas caro em um store completo.

## Próximo passo

- [Como round_context (proposals) vincula notas de memória a propostas ativas](../../proposals/tutorials/pt/getting-started.md)
- [Contrato de redação de segredos](https://github.com/CartagoGit/mcp-vertex/blob/main/packages/core/src/lib/shared/redact.ts)
