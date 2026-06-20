---
title: Exécuter les gates de qualité pour n'importe quel langage
plugin: quality
audience: agent qui doit valider l'état du projet
order: 1
lang: fr
---

# Exécuter les gates de qualité pour n'importe quel langage

Le plugin `quality` est **agnostique au langage** par conception : il lance
la commande que votre `mcp-vertex.config.json` spécifie et rapporte le
code de sortie. Ce tutoriel montre les trois sources de scopes (par ordre
de priorité), comment en exécuter un, et comment annuler un processus
incontrôlé.

## 0. Le modèle mental

Un **scope** est une liste nommée de commandes. Le plugin exécute chaque
commande du scope, dans l'ordre, capture stdout/stderr, et renvoie un
rapport structuré `{ ok, results: [{ command, ok, code, tail }] }`. Le
champ `ok` concerne le scope entier — si une commande échoue, le scope
n'est pas ok.

```
┌─ plugin options.scopes (priorité la plus haute)
├─ mcp-vertex.config.json → validationMatrix.scopes
└─ scripts package.json détectés → "all" (lint, typecheck, test, build)
```

## 1. Lister les scopes disponibles (lecture seule)

```json
{ "tool": "quality_get_quality_scopes", "args": {} }
```

Exemple de réponse (tronquée) :

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

## 2. Exécuter un scope

```json
{ "tool": "quality_run_quality", "args": { "scope": "all" } }
```

La réponse est par commande :

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

Lisez `results[N].tail` pour le contexte de l'échec. Le `tail` correspond
aux 20 dernières lignes non vides (plafonnées à 64 Kio de sortie totale)
— assez pour déboguer sans noyer le contexte de l'agent.

## 3. Annuler un processus incontrôlé

```json
{ "tool": "quality_quality_cancel", "args": {} }
```

Envoie `SIGKILL` au groupe de processus de chaque exécution en cours.
Passez `{ "pid": <number> }` pour en annuler un. L'annulation est
non-bloquante : le `results` du prochain appel reflètera le kill.

## 4. Rendre agnostique au langage

Le core exécute ce que votre config dit. Exemple pour un projet polyglotte
(TypeScript + Python) :

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

`run_quality` exécutera **les quatre commandes** dans les scopes `typecheck`
/ `test`, quel que soit le langage. Exit 0 = succès ; non-zéro = échec
(peu importe quel binaire l'a émis).

## 5. Renforcer avec une politique de commande (M13)

`run_quality` **exécute** ce que la config de l'hôte dit. Pour restreindre
quels binaires peuvent s'exécuter quand un agent moins fiable appelle
l'outil, utilisez `commandPolicy` :

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

Une commande bloquée est rapportée avec `code: 126` et une raison
(« blocked by command policy ») et n'est **jamais lancée**. `deny`
prend le dessus sur `allow` ; un `allow` vide signifie « tout binaire
non interdit ».

## Erreurs fréquentes

- **`run_quality` ne remplace pas `bun run validate`** : le script
  `validate` du core exécute les quatre vérifications directement.
  `run_quality` est pour les exécutions **ad-hoc** et l'introspection
  par scope depuis un agent. Les deux sont valides et ne communiquent
  pas entre eux.
- **Une commande longue qui dépasse le timeout** est tuée avec `code: 124`
  et `timedOut: true`. Le timeout par défaut est 600 000 ms (10 minutes).
  Surchargez par runner si nécessaire.
- **Sonder « est-ce terminé ? »** : ne le faites pas. `run_quality` est
  synchrone. Si vous avez besoin de connaître les longs scopes, utilisez
  `quality_cancel` avec le `pid` de `activeRunPids` (via métriques ou
  un appel d'outil suivant).

## Étape suivante

- [Gates de qualité multi-langages (p107)](../../p107-multilang-quality-gates.md)
- [Frontière de confiance & politique de commande (M13)](../../p107-multilang-quality-gates.md#5-no-objetivos)
