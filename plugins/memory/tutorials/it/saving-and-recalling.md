---
title: Salvare e richiamare note di memoria
plugin: memory
audience: qualsiasi agente che ha bisogno di continuità tra le sessioni
order: 1
lang: it
---

# Salvare e richiamare note di memoria

Questo tutorial mostra i quattro strumenti `memory_*` in azione. Le
note sono piccoli record JSON in `.cache/mcp-vertex/memory/notes.json`
— abbastanza piccoli da essere scaricati interamente, indicizzati per id,
recuperabili per tag o query a testo pieno.

## 0. Il modello mentale

Una **nota** è `{ id, title, body, tags, createdAt, updatedAt }`.
I titoli sono univoci (senza distinzione tra maiuscole e minuscole) —
`memory_save` esegue un upsert per titolo. Non esiste uno schema per
`body`; trattarlo come un breve campo di testo libero. I segreti vengono
auto-eliminati da `redactSecrets` prima che la nota venga persistita
(vedi `packages/core/src/lib/shared/redact.ts`).

## 1. Salvare una nota

```json
{
  "tool": "memory_save",
  "args": {
    "title": "ordine di pubblicazione monorepo",
    "body": "core prima, poi i plugin in lockstep. derive-version.ts legge i Conventional Commits dall'ultimo tag vX.Y.Z.",
    "tags": ["release", "monorepo"]
  }
}
```

Risposta: `{ id: "<uuid>", createdAt: "..." }`. Save restituisce l'id
così da poterlo `dimenticare` in seguito.

## 2. Richiamare per query

```json
{
  "tool": "memory_recall",
  "args": {
    "query": "ordine di pubblicazione",
    "limit": 5
  }
}
```

Restituisce fino a `limit` note che corrispondono alla query (match su
sottostringa di titolo + body, classificate per recenza). Usare `tags`
invece di (o insieme a) `query` per restringere:

```json
{
  "tool": "memory_recall",
  "args": { "tags": ["release"], "limit": 10 }
}
```

## 3. Elencare in modo economico

`memory_list` restituisce solo `{ id, title, tags }` — l'indice. Usarlo
quando non si vogliono ancora recuperare i body:

```json
{ "tool": "memory_list", "args": { "limit": 50 } }
```

## 4. Dimenticare

```json
{ "tool": "memory_forget", "args": { "id": "<uuid>" } }
```

`memory_forget` è un'eliminazione definitiva — non esiste eliminazione
soft / archivio. L'id è scomparso; il titolo è libero per un futuro
`memory_save`.

## Errori comuni

- **Segreti in `body`**: anche se il plugin elimina al momento del
  salvataggio, non incollare token grezzi o valori in stile `.env` —
  la rimozione è euristica, non perfetta.
- **Collisioni di titolo**: `memory_save` esegue un upsert per titolo.
  Se due agenti salvano lo stesso titolo in parallelo, vince il secondo
  scrittore e il primo viene perso. Usare titoli univoci per slice / per
  problema.
- **Recall restituisce troppi risultati**: preferire `tags` a una `query`
  ampia. Una query di `""` restituisce tutto ordinato per recenza —
  utile per "cosa ho salvato nell'ultima sessione?" ma costoso su uno
  store completo.

## Prossimo passo

- [Come round_context (proposals) collega le note di memoria alle proposte attive](../../proposals/tutorials/it/getting-started.md)
- [Contratto di redazione dei segreti](https://github.com/CartagoGit/mcp-vertex/blob/main/packages/core/src/lib/shared/redact.ts)
