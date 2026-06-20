---
title: Préréglages de lint et de vérification de types adaptés au framework
plugin: rules
audience: agent qui doit appliquer des règles de lint/type
order: 1
lang: fr
---

# Préréglages de lint et de vérification de types adaptés au framework

Le plugin `rules` répond à une question : « quelles règles de lint et de
vérification de types dois-je appliquer à ce projet, ce fichier, ce
dossier ? » La réponse est dérivée du **framework** que le projet utilise
et de **quelle zone du projet** un fichier réside. La configuration du
projet a toujours la priorité.

## 0. Le modèle mental

Une **zone de projet** est un répertoire de premier niveau avec son propre
`package.json` (ou équivalent). Chaque zone obtient un framework détecté
depuis son `package.json` / `requirements.txt` / `Cargo.toml` /
`pubspec.yaml` / `go.mod` — le plugin livre une petite bibliothèque de
mappings « je vois X, je défauts à Y ».

Un **préréglage** est un bundle de (règles de lint, config de vérification
de types) pour un framework donné. Le plugin a des préréglages pour
`ts-eslint`, `ts-prettier`, `py-ruff`, `rs-clippy`, `go-vet`, `kt-detekt`,
… (seulement ceux qui correspondent aux outils installés sur l'hôte).

Le plugin peut fonctionner en trois modes (défini avec `--rules-mode=`) :

| Mode | Comportement |
|---|---|
| `strict` | Échec si le projet n'a pas de config et qu'aucun préréglage ne le couvre. |
| `mixed` (défaut) | Appliquer le préréglage si le projet n'a pas de config ; ne jamais échouer. |
| `advisory` | Ne rien écrire ; seulement rapporter ce qui *serait* appliqué. |

## 1. Appliquer un préréglage à une zone du projet

```json
{
  "tool": "rules_apply",
  "args": {
    "area": "apps/web",
    "framework": "ts-react"
  }
}
```

La réponse est une liste de fichiers écrits + un résumé :

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

Si le projet a déjà un `.eslintrc.json`, le plugin le laisse intact et
rapporte `preset: "user-override"`. La config du projet a **toujours
priorité** — c'est le contrat.

## 2. Lister les préréglages disponibles

```json
{ "tool": "rules_get_presets", "args": { "framework": "ts-react" } }
```

Retourne le nom du préréglage, les fichiers qu'il écrirait, et un lien
vers la config upstream dont il hérite. La liste est ce que l'hôte a
installé dans `node_modules` — pas de fetch réseau.

## 3. Vérifier ce qui serait appliqué (dry run)

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

Même forme de réponse, mais le tableau `written` reflète ce qui
**serait** écrit — rien ne l'est. À utiliser en mode advisory ou pour
montrer un diff à l'utilisateur avant de valider.

## 4. Mapper un projet sur ses zones (CI-friendly)

`rules_resolve_map` est l'outil en lecture seule qui retourne le mapping
détecté zone du projet → framework → préréglage. Le plugin met en cache
cela dans `.cache/mcp-vertex/rules/rules-map.json` pour qu'une exécution
CI ne re-détecte pas à chaque invocation.

```json
{ "tool": "rules_resolve_map", "args": {} }
```

## Erreurs fréquentes

- **Deux `package.json` dans la même zone** (workspace + imbriqué) :
  le plugin prend le plus proche du fichier. Si la détection est mauvaise,
  passez `area` explicitement.
- **Framework personnalisé** : passez `framework: "<votre-nom>"` et le
  plugin n'appliquera pas de préréglage (aucun match dans le registre).
  L'outil répondra avec `preset: "no-preset"` et un avertissement.
- **Outil non installé localement** : appliquer un préréglage qui requiert
  `ruff` sur une machine sans `ruff` réussira (le plugin n'écrit que la
  config) mais le `quality_run_quality` en aval échouera avec
  `code: 127`. Lancez `rules_check` en premier pour dry-run la chaîne
  complète.

## Étape suivante

- [Comment les plugins `rules` et `quality` collaborent](#)
- [Personnaliser un préréglage sans le forker (la règle du user-override)](#)
