---
title: Preset di lint e verifica dei tipi per framework
plugin: rules
audience: agente che deve applicare regole di lint/tipo
order: 1
lang: it
---

# Preset di lint e verifica dei tipi per framework

Il plugin `rules` risponde a una domanda: "quali regole di lint e verifica
dei tipi devo applicare a questo progetto, questo file, questa cartella?"
La risposta deriva dal **framework** che il progetto usa e da **quale
area del progetto** si trova un file. La configurazione del progetto ha
sempre la precedenza.

## 0. Il modello mentale

Un'**area del progetto** è una directory di primo livello con il proprio
`package.json` (o equivalente). Ogni area riceve un framework rilevato
dal suo `package.json` / `requirements.txt` / `Cargo.toml` /
`pubspec.yaml` / `go.mod` — il plugin fornisce una piccola libreria di
mapping "vedo X, predefinito Y".

Un **preset** è un bundle di (regole di lint, config di verifica dei tipi)
per un dato framework. Il plugin ha preset per `ts-eslint`, `ts-prettier`,
`py-ruff`, `rs-clippy`, `go-vet`, `kt-detekt`, … (solo quelli che
mappano a tool installati nell'host).

Il plugin può funzionare in tre modalità (impostate con `--rules-mode=`):

| Modalità | Comportamento |
|---|---|
| `strict` | Fallisce se il progetto non ha config regole e nessun preset lo copre. |
| `mixed` (predefinita) | Applicare il preset se il progetto non ha config; non fallire mai. |
| `advisory` | Non scrivere nulla; solo riportare cosa *verrebbe* applicato. |

## 1. Applicare un preset a un'area del progetto

```json
{
  "tool": "rules_apply",
  "args": {
    "area": "apps/web",
    "framework": "ts-react"
  }
}
```

La risposta è un elenco di file scritti + un riepilogo:

```json
{
  "ok": true,
  "written": [
    "apps/web/.eslintrc.json",
    "apps/web/tsconfig.strict.json"
  ],
  "preset": "ts-eslint+ts-prettier",
  "warnings": []
}
```

Se il progetto ha già un `.eslintrc.json`, il plugin lo lascia stare e
riporta `preset: "user-override"`. La config del progetto **ha sempre
priorità** — questo è il contratto.

## 2. Elencare i preset disponibili

```json
{ "tool": "rules_get_presets", "args": { "framework": "ts-react" } }
```

Restituisce il nome del preset, i file che scriverebbe e un link alla
config upstream da cui eredita. L'elenco è quello che l'host ha installato
in `node_modules` — nessun fetch di rete.

## 3. Verificare cosa verrebbe applicato (dry run)

```json
{
  "tool": "rules_apply",
  "args": {
    "area": "apps/web",
    "framework": "ts-react",
    "dryRun": true
  }
}
```

Stessa forma di risposta, ma l'array `written` riflette cosa **verrebbe**
scritto — nulla viene scritto. Usare in modalità advisory o per mostrare
all'utente un diff prima di procedere.

## 4. Mappare un progetto alle sue aree (CI-friendly)

`rules_resolve_map` è lo strumento di sola lettura che restituisce il
mapping rilevato area del progetto → framework → preset. Il plugin lo
memorizza nella cache in `.cache/mcp-vertex/rules/rules-map.json`
affinché un'esecuzione CI non ri-rilevi a ogni invocazione.

```json
{ "tool": "rules_resolve_map", "args": {} }
```

## Errori comuni

- **Due `package.json` nella stessa area** (workspace + nested): il
  plugin prende quello più vicino al file. Se il rilevamento è errato,
  passare `area` esplicitamente.
- **Framework personalizzato**: passare `framework: "<il-vostro-nome>"` e
  il plugin non applicherà un preset (nessun match nel registro). Lo
  strumento risponderà con `preset: "no-preset"` e un avvertimento.
- **Tool non installato localmente**: applicare un preset che richiede
  `ruff` su una macchina senza `ruff` avrà successo (il plugin scrive
  solo config) ma il `quality_run_quality` downstream fallirà con
  `code: 127`. Eseguire prima `rules_check` per simulare l'intera catena.

## Prossimo passo

- [Come i plugin `rules` e `quality` collaborano](#)
- [Personalizzare un preset senza forkarlo (la regola user-override)](#)
