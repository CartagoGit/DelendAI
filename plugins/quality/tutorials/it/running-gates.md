---
title: Eseguire i gate di qualità per qualsiasi linguaggio
plugin: quality
audience: agente che deve validare lo stato del progetto
order: 1
lang: it
---

# Eseguire i gate di qualità per qualsiasi linguaggio

Il plugin `quality` è **agnostico al linguaggio** per design: lancia
qualsiasi comando specifica il vostro `mcp-vertex.config.json` e riporta
il codice di uscita. Questo tutorial mostra le tre fonti di scope (in
ordine di priorità), come eseguirne uno e come annullare un'esecuzione
fuori controllo.

## 0. Il modello mentale

Uno **scope** è un elenco di comandi con nome. Il plugin esegue ogni
comando dello scope, in ordine, cattura stdout/stderr e restituisce un
report strutturato `{ ok, results: [{ command, ok, code, tail }] }`.
Il campo `ok` riguarda l'intero scope — se un comando fallisce, lo scope
non è ok.

```
┌─ plugin options.scopes (priorità più alta)
├─ mcp-vertex.config.json → validationMatrix.scopes
└─ script package.json rilevati → "all" (lint, typecheck, test, build)
```

## 1. Elencare gli scope disponibili (sola lettura)

```json
{ "tool": "quality_get_quality_scopes", "args": {} }
```

Esempio di risposta (troncata):

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

## 2. Eseguire uno scope

```json
{ "tool": "quality_run_quality", "args": { "scope": "all" } }
```

La risposta è per comando:

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

Leggere `results[N].tail` per il contesto del fallimento. Il `tail` sono
le ultime 20 righe non vuote (limitate a 64 KiB di output totale) —
abbastanza per il debug senza inondare il contesto dell'agente.

## 3. Annullare un'esecuzione fuori controllo

```json
{ "tool": "quality_quality_cancel", "args": {} }
```

Invia `SIGKILL` al gruppo di processi di ogni esecuzione in corso.
Passare `{ "pid": <number> }` per annullarne una. L'annullamento è
non-bloccante: il `results` della prossima chiamata rifletterà il kill.

## 4. Rendere agnostico al linguaggio

Il core esegue ciò che la configurazione specifica. Esempio per un
progetto poliglotta (TypeScript + Python):

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

`run_quality` eseguirà **tutti e quattro i comandi** negli scope
`typecheck` / `test`, indipendentemente dal linguaggio. Exit 0 = superato;
non-zero = fallito (indipendentemente da quale binario lo ha emesso).

## 5. Rafforzare con una policy dei comandi (M13)

`run_quality` **esegue** ciò che la config dell'host dice. Per limitare
quali binari possono essere eseguiti quando un agente meno affidabile
chiama lo strumento, usare `commandPolicy`:

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

Un comando bloccato viene riportato con `code: 126` e una motivazione
("blocked by command policy") e non viene **mai lanciato**. `deny` ha
la precedenza su `allow`; un `allow` vuoto significa "qualsiasi binario
non negato".

## Errori comuni

- **`run_quality` non sostituisce `bun run validate`**: lo script
  `validate` del core esegue i quattro controlli direttamente.
  `run_quality` è per esecuzioni **ad-hoc** e introspezione per scope
  da un agente. Entrambi sono validi; non comunicano tra loro.
- **Un comando di lunga durata che supera il timeout** viene terminato
  con `code: 124` e `timedOut: true`. Il timeout predefinito è 600 000 ms
  (10 minuti). Sovrascrivere per runner se necessario.
- **Polling per "è finito?"**: non farlo. `run_quality` è sincrono.
  Se si ha bisogno di conoscere gli scope lunghi, usare `quality_cancel`
  con il `pid` da `activeRunPids` (via metriche o una chiamata
  successiva allo strumento).

## Prossimo passo

- [Gate di qualità multi-linguaggio (p107)](../../p107-multilang-quality-gates.md)
- [Confine di fiducia & policy dei comandi (M13)](../../p107-multilang-quality-gates.md#5-no-objetivos)
