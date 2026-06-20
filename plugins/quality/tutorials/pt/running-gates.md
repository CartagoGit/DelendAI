---
title: Executar gates de qualidade para qualquer linguagem
plugin: quality
audience: agente que precisa validar o estado do projeto
order: 1
lang: pt
---

# Executar gates de qualidade para qualquer linguagem

O plugin `quality` é **agnóstico de linguagem** por design: ele executa
qualquer comando que o seu `mcp-vertex.config.json` especifique e reporta
o código de saída. Este tutorial mostra as três fontes de scopes (em
ordem de prioridade), como executar um, e como cancelar um processo
descontrolado.

## 0. O modelo mental

Um **scope** é uma lista nomeada de comandos. O plugin executa cada
comando no scope, em ordem, captura stdout/stderr e retorna um relatório
estruturado `{ ok, results: [{ command, ok, code, tail }] }`. O campo
`ok` é para o scope inteiro — se algum comando falha, o scope não está ok.

```
┌─ plugin options.scopes (prioridade mais alta)
├─ mcp-vertex.config.json → validationMatrix.scopes
└─ scripts package.json detectados → "all" (lint, typecheck, test, build)
```

## 1. Listar os scopes disponíveis (somente leitura)

```json
{ "tool": "quality_get_quality_scopes", "args": {} }
```

Exemplo de resposta (truncada):

```json
{
  "scopes": {
    "all": [
      { "command": "bun run lint", "expect": "exit0" },
      { "command": "bun run typecheck", "expect": "exit0" },
      { "command": "bun run test", "expect": "exit0" }
    ]
  }
}
```

## 2. Executar um scope

```json
{ "tool": "quality_run_quality", "args": { "scope": "all" } }
```

A resposta é por comando:

```json
{
  "scope": "all",
  "ok": false,
  "results": [
    {
      "command": "bun run lint",
      "ok": true,
      "code": 0,
      "tail": "Checked 400 files in 159ms. No fixes applied."
    },
    {
      "command": "bun run test",
      "ok": false,
      "code": 1,
      "tail": "FAIL tests/src/foo.spec.ts …"
    }
  ]
}
```

Leia `results[N].tail` para o contexto da falha. O `tail` são as últimas
20 linhas não vazias (limitadas a 64 KiB de saída total) — suficiente
para depurar sem inundar o contexto do agente.

## 3. Cancelar um processo descontrolado

```json
{ "tool": "quality_quality_cancel", "args": {} }
```

Envia `SIGKILL` ao grupo de processos de cada execução em andamento.
Passe `{ "pid": <number> }` para cancelar um. O cancelamento é
não-bloqueante: o `results` da próxima chamada refletirá o kill.

## 4. Tornar agnóstico de linguagem

O core executa o que a sua config diz. Exemplo para um projeto poliglota
(TypeScript + Python):

```jsonc
// mcp-vertex.config.json
{
  "plugins": { "quality": { "options": {} } },
  "validationMatrix": {
    "scopes": {
      "typecheck": [
        { "command": "tsc --noEmit", "expect": "exit0" },
        { "command": "mypy .",      "expect": "exit0" }
      ],
      "test": [
        { "command": "vitest run", "expect": "exit0" },
        { "command": "pytest -q",  "expect": "exit0" }
      ]
    }
  }
}
```

`run_quality` executará **todos os quatro comandos** nos scopes `typecheck`
/ `test`, independentemente da linguagem. Exit 0 = passou; não-zero =
falhou (independente de qual binário o emitiu).

## 5. Fortalecer com uma política de comando (M13)

`run_quality` **executa** o que a config do host diz. Para restringir
quais binários podem ser executados quando um agente menos confiável
chama a ferramenta, use `commandPolicy`:

```jsonc
{
  "plugins": {
    "quality": {
      "options": {
        "commandPolicy": {
          "allow": ["bun", "npm", "npx", "tsc", "vitest", "biome", "mypy", "ruff", "pytest"],
          "deny":  ["curl", "wget", "bash", "sh"]
        }
      }
    }
  }
}
```

Um comando bloqueado é reportado com `code: 126` e uma razão ("blocked by
command policy") e **nunca é executado**. `deny` prevalece sobre `allow`;
um `allow` vazio significa "qualquer binário não negado".

## Erros frequentes

- **`run_quality` não substitui `bun run validate`**: o script `validate`
  do core executa as quatro verificações diretamente. `run_quality` é
  para execuções **ad-hoc** e introspecção por escopo a partir de um
  agente. Ambos são válidos; não se comunicam entre si.
- **Um comando de longa duração que excede o timeout** é morto com
  `code: 124` e `timedOut: true`. O timeout padrão é 600 000 ms (10
  minutos). Substitua por runner se necessário.
- **Polling por "está pronto?"**: não faça. `run_quality` é síncrono.
  Se você precisar saber sobre scopes longos, use `quality_cancel` com
  o `pid` de `activeRunPids` (via métricas ou uma chamada de ferramenta
  de acompanhamento).

## Próximo passo

- [Gates de qualidade multilíngues (l107)](../../l107-multilang-quality-gates.md)
- [Fronteira de confiança & política de comando (M13)](../../l107-multilang-quality-gates.md#5-no-objetivos)
