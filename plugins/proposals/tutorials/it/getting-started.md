---
title: Iniziare con il plugin proposals
plugin: proposals
audience: orchestratore / agente
order: 1
lang: it
---

# Iniziare con il plugin proposals

Questo tutorial parte da un workspace vuoto e termina con un ciclo
funzionante proposta → slice → implementazione → chiusura, con la
disciplina del mutex dei file intatta. Si assume che il plugin
`proposals` sia abilitato (vedere `plugins/proposals/README.md`
per lo snippet JSON).

## 0. Il modello mentale

Una **proposta** è un file markdown con un'intestazione frontmatter.
Uno **slice** è una sezione numerata al suo interno. Il plugin
coordina due scrittori per slice: uno richiede, l'altro rilascia.
`auto_work` è il punto di ingresso di alto livello "cosa devo fare
dopo?".

```
docs/mcp-vertex/proposals/
├─ index.json          (rigenerato da sync_proposals)
├─ p<N>-<titolo>.md   (una proposta)
│  ├─ ## Slices
│  │  ├─ s1-claim
│  │  ├─ s2-implement
│  │  └─ s3-close
```

## 1. Iniziare con `auto_work`

`auto_work` restituisce il prossimo slice attuabile nell'intero
store delle proposte, con un piano ordinato e compatto. Il piano
deve essere eseguito alla lettera — senza improvvisare passi.

```json
// Chiamata allo strumento MCP
{ "tool": "proposals_auto_work", "args": {} }

// Risposta tipica (troncata)
{
  "state": "work",
  "proposalId": "l110",
  "sliceId": "s1-claim",
  "steps": [
    "Aprire docs/mcp-vertex/proposals/l110-…md e scegliere il prossimo slice atomico.",
    "Richiedere i suoi file: proposals_agent_lock { action: \"claim\", … }.",
    "Implementare esattamente quello slice — niente al di fuori dei file richiesti.",
    "Validare secondo il gate del progetto (vedere get_validation_matrix se presente).",
    "Segnare il progresso nella proposta, poi proposals_sync_proposals.",
    "Rilasciare: proposals_agent_lock { action: \"release\", task_id }."
  ]
}
```

## 2. Richiedere i file dello slice

Lo strumento `proposals_agent_lock` registra chi possiede quali
percorsi per la durata di uno slice. Senza una richiesta,
`sync_proposals` si rifiuterà di contrassegnare lo slice come
fatto.

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

La risposta porta un `task_id` da conservare fino al rilascio.
Due agenti che richiedono lo stesso file ⇒ conflitto, nessun
progresso. Il mutex è supportato dal filesystem (non consultivo)
e sopravvive ai riavvii del processo.

## 3. Implementare lo slice e validare

Modificare solo i file richiesti. Eseguire il gate:

```bash
bun run validate
```

Se il gate fallisce, correggere lo slice — non ampliare la
richiesta in silenzio.

## 4. Segnare il progresso e sincronizzare

`sync_proposals` legge i file delle proposte, valida il loro
frontmatter + piano degli slice, e ricostruisce `index.json`.
È economico e idempotente.

```json
{ "tool": "proposals_sync_proposals", "args": {} }
```

## 5. Chiudere lo slice

```json
{
  "tool": "proposals_close_slice",
  "args": {
    "proposalId": "l110",
    "sliceId": "s1-claim"
  }
}
```

Questo riscrive lo stato dello slice su `done` nella proposta,
rimuove il lock e risincronizza l'indice. Poi richiamare
`auto_work` — restituirà il prossimo slice (o `state: "idle"` se
lo store è esaurito).

## Errori comuni

- **Modificare file al di fuori della richiesta**: `sync_proposals`
  rifiuterà di contrassegnare lo slice come fatto. Usare un secondo
  slice con la propria richiesta, o dividere la proposta.
- **Saltare `sync_proposals`**: l'indice diventa obsoleto. Il
  prossimo agente chiede "il prossimo slice" e ottiene quello
  sbagliato.
- **Dimenticare il rilascio**: un lock obsoleto blocca il prossimo
  orchestratore per fino a `staleMs` (default 30 s). Chiamare
  `proposals_agent_lock { action: "gc" }` per ripulire.

## Prossimo passo

- [Come il plugin agent_worktree isola gli agenti concorrenti](#)
- [Modalità di persistenza per auto_work (l109)](../../l109-feat-auto-work-persist-modes.md)
- [Round context per il lavoro ripreso](#)
