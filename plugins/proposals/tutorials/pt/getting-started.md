---
title: Introdução ao plugin proposals
plugin: proposals
audience: orquestrador / agente
order: 1
lang: pt
---

# Introdução ao plugin proposals

Este tutorial começa com um workspace vazio e termina com um ciclo
funcional proposta → slice → implementação → encerramento, com a
disciplina do mutex de arquivos intacta. Assume que o plugin
`proposals` está ativo (veja `plugins/proposals/README.md` para
o snippet JSON).

## 0. O modelo mental

Uma **proposta** é um arquivo markdown com um cabeçalho frontmatter.
Um **slice** é uma seção numerada dentro dele. O plugin coordena
dois escritores por slice: um reivindica, outro libera. `auto_work`
é o ponto de entrada de alto nível "o que faço a seguir?".

```
docs/mcp-vertex/proposals/
├─ index.json          (regenerado por sync_proposals)
├─ p<N>-<titulo>.md   (uma proposta)
│  ├─ ## Slices
│  │  ├─ s1-claim
│  │  ├─ s2-implement
│  │  └─ s3-close
```

## 1. Começar com `auto_work`

`auto_work` retorna o próximo slice acionável em todo o store de
propostas, com um plano ordenado e compacto. O plano deve ser
executado literalmente — sem improvisar etapas.

```json
// Chamada à ferramenta MCP
{ "tool": "proposals_auto_work", "args": {} }

// Resposta típica (truncada)
{
  "state": "work",
  "proposalId": "p110",
  "sliceId": "s1-claim",
  "steps": [
    "Abrir docs/mcp-vertex/proposals/p110-…md e escolher o próximo slice atômico.",
    "Reivindicar seus arquivos: proposals_agent_lock { action: \"claim\", … }.",
    "Implementar exatamente esse slice — nada fora dos arquivos reivindicados.",
    "Validar conforme o gate do projeto (ver get_validation_matrix se presente).",
    "Marcar o progresso na proposta e em seguida proposals_sync_proposals.",
    "Liberar: proposals_agent_lock { action: \"release\", task_id }."
  ]
}
```

## 2. Reivindicar os arquivos do slice

A ferramenta `proposals_agent_lock` registra quem possui quais
caminhos durante a duração de um slice. Sem uma reivindicação,
`sync_proposals` recusará marcar o slice como concluído.

```json
{
  "tool": "proposals_agent_lock",
  "args": {
    "action": "claim",
    "files": [
      "apps/web/src/components/PluginPage.astro",
      "apps/web/src/data/capabilities.json"
    ]
  }
}
```

A resposta carrega um `task_id` que deve ser guardado até a
liberação. Dois agentes reivindicando o mesmo arquivo ⇒ conflito,
sem progresso. O mutex é respaldado pelo sistema de arquivos
(não consultivo) e sobrevive a reinicializações do processo.

## 3. Implementar o slice e validar

Edite apenas os arquivos reivindicados. Execute o gate:

```bash
bun run validate
```

Se o gate falhar, corrija o slice — não amplie a reivindicação
em silêncio.

## 4. Marcar progresso e sincronizar

`sync_proposals` lê os arquivos de propostas, valida seu
frontmatter + plano de slices, e reconstrói `index.json`. É
rápido e idempotente.

```json
{ "tool": "proposals_sync_proposals", "args": {} }
```

## 5. Encerrar o slice

```json
{
  "tool": "proposals_close_slice",
  "args": {
    "proposalId": "p110",
    "sliceId": "s1-claim"
  }
}
```

Isso reescreve o status do slice para `done` na proposta, remove
o lock e re-sincroniza o índice. Em seguida, chame `auto_work`
novamente — retornará o próximo slice (ou `state: "idle"` se o
store estiver esgotado).

## Erros frequentes

- **Editar arquivos fora da reivindicação**: `sync_proposals` se
  recusa a marcar o slice como concluído. Use um segundo slice
  com sua própria reivindicação ou divida a proposta.
- **Pular `sync_proposals`**: o índice fica desatualizado. O próximo
  agente pede "o próximo slice" e obtém o errado.
- **Esquecer de liberar**: um lock obsoleto bloqueia o próximo
  orquestrador por até `staleMs` (padrão 30 s). Chame
  `proposals_agent_lock { action: "gc" }` para limpar.

## Próximo passo

- [Como o plugin agent_worktree isola agentes concorrentes](#)
- [Modos de persistência para auto_work (p109)](../../p109-feat-auto-work-persist-modes.md)
- [Round context para trabalho retomado](#)
