---
title: Catalogare la documentazione del progetto
plugin: docs
audience: qualsiasi agente che deve trovare un doc per argomento
order: 1
lang: it
---

# Catalogare la documentazione del progetto

Il plugin `docs` risponde a una piccola domanda frequente: "quali doc
ha questo progetto, e quale sto cercando?" Invece di fare grep, l'agente
chiede al plugin. Questo tutorial mostra come abilitare, elencare e
leggere.

## 0. Il modello mentale

Un **doc** è qualsiasi file `.md` sotto le `roots` configurate. Il plugin
li enumera una volta, estrae il titolo (dal primo `# heading` o dal
frontmatter `title:`), e serve un indice a basso consumo di token. Il
body viene recuperato solo su richiesta.

La configurazione si trova in `mcp-vertex.config.json`:

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

`roots` è un array di percorsi (file o directory). Le directory vengono
esplorate ricorsivamente. **I percorsi al di fuori del workspace sono
rifiutati** — nessuna traversata `..`.

## 1. Elencare (indice a basso token)

```json
{ "tool": "docs_list", "args": {} }
```

Risposta (troncata):

```json
{
  "count": 18,
  "truncated": false,
  "docs": [
    { "path": "README.md", "title": "@mcp-vertex/core" },
    { "path": "docs/ARCHITECTURE.md", "title": "Architecture" },
    { "path": "docs/proposals/l100-…md", "title": "l100 — Web: i18n reale…" },
    { "path": "CHANGELOG.md", "title": "Changelog" }
  ]
}
```

L'elenco è ordinato per percorso. Passare `roots` per limitare l'elenco
a un sottoinsieme (es. solo `["docs/proposals"]`):

```json
{
  "tool": "docs_list",
  "args": { "roots": ["docs/proposals"] }
}
```

## 2. Leggere un doc

```json
{
  "tool": "docs_read",
  "args": { "path": "docs/ARCHITECTURE.md" }
}
```

Risposta:

```json
{
  "path": "docs/ARCHITECTURE.md",
  "title": "Architecture",
  "content": "# Architecture\n\n…corpo completo…",
  "truncated": false,
  "found": true
}
```

`content` è limitato a 256 KiB. Se il doc è più grande, `truncated:
true` e il body sono i primi 256 KiB. Se il percorso non corrisponde
a nessun doc sotto le roots configurate, `found: false`.

## 3. Perché due strumenti e non uno

`list` è economico (poche centinaia di byte per doc, 18 doc ≈ 4 KiB).
`read` è costoso (potenzialmente megabyte per doc). Separarli consente
all'agente di fare prima `list`, poi `read` solo quelli che sembrano
rilevanti — risparmiando token in ogni fase di scoperta.

## 4. Contenimento del percorso (sicurezza)

`docs_read` risolve il percorso con `resolveWorkspaceContained` — i
percorsi assoluti, la traversata `..` e i symlink che puntano fuori dal
workspace sono tutti rifiutati. La risposta `found: false` è il segnale
dell'agente che il percorso è stato rifiutato; il plugin non distingue
intenzionalmente tra "mancante" e "fuori workspace" (per evitare di
rivelare il layout del filesystem).

## Errori comuni

- **La root non esiste**: `docs_list` restituisce `{ count: 0,
  truncated: false, docs: [] }`. Il plugin non avvisa.
- **Doc non ancora commesso**: i file non tracciati vengono comunque
  serviti (il plugin legge dal filesystem, non da git). Il `path`
  restituito è relativo al workspace.
- **L'inferenza del titolo fallisce**: se il primo heading non è `# `
  (nessuno spazio, livello sbagliato) e non c'è frontmatter `title:`,
  il plugin usa il basename del file (es. `CHANGELOG.md` →
  `CHANGELOG.md`). Rieseguire dopo aver corretto l'heading.

## Prossimo passo

- [Come `docs_list` si integra con `memory_recall` per "cosa ho salvato + dove era documentato?"](#)
- [Curare un indice della conoscenza con il plugin `knowledge`](#)
