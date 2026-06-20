---
title: Cataloguer la documentation du projet
plugin: docs
audience: tout agent qui doit trouver un doc par sujet
order: 1
lang: fr
---

# Cataloguer la documentation du projet

Le plugin `docs` répond à une petite question fréquente : « quels docs
ce projet a-t-il, et lequel est-ce que je cherche ? » Au lieu de faire
un grep, l'agent demande au plugin. Ce tutoriel montre comment activer,
lister et lire.

## 0. Le modèle mental

Un **doc** est n'importe quel fichier `.md` sous les `roots` configurées.
Le plugin les énumère une fois, extrait le titre (depuis le premier
`# heading` ou le frontmatter `title:`), et sert un index à faible
consommation de tokens. Le body n'est récupéré qu'à la demande.

La configuration se trouve dans `mcp-vertex.config.json` :

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

`roots` est un tableau de chemins (fichiers ou répertoires). Les
répertoires sont parcourus récursivement. **Les chemins hors du
workspace sont refusés** — pas de traversée `..`.

## 1. Lister (index à faible token)

```json
{ "tool": "docs_list", "args": {} }
```

Réponse (tronquée) :

```json
{
  "count": 18,
  "truncated": false,
  "docs": [
    { "path": "README.md", "title": "@mcp-vertex/core" },
    { "path": "docs/ARCHITECTURE.md", "title": "Architecture" },
    { "path": "docs/proposals/p100-…md", "title": "p100 — Web: i18n réel…" },
    { "path": "CHANGELOG.md", "title": "Changelog" }
  ]
}
```

La liste est triée par chemin. Passez `roots` pour limiter la liste à
un sous-ensemble (ex. juste `["docs/proposals"]`) :

```json
{
  "tool": "docs_list",
  "args": { "roots": ["docs/proposals"] }
}
```

## 2. Lire un doc

```json
{
  "tool": "docs_read",
  "args": { "path": "docs/ARCHITECTURE.md" }
}
```

Réponse :

```json
{
  "path": "docs/ARCHITECTURE.md",
  "title": "Architecture",
  "content": "# Architecture\n\n…corps complet…",
  "truncated": false,
  "found": true
}
```

`content` est limité à 256 Kio. Si le doc est plus grand, `truncated:
true` et le body est les premiers 256 Kio. Si le chemin ne correspond
à aucun doc sous les roots configurées, `found: false`.

## 3. Pourquoi deux outils et pas un

`list` est bon marché (quelques centaines d'octets par doc, 18 docs ≈
4 Kio). `read` est coûteux (potentiellement des mégaoctets par doc). Les
séparer permet à l'agent de `list` d'abord, puis de `read` uniquement
ceux qui semblent pertinents — économisant des tokens à chaque étape
de découverte.

## 4. Contenu du chemin (sécurité)

`docs_read` résout le chemin avec `resolveWorkspaceContained` — les
chemins absolus, la traversée `..`, et les symlinks pointant hors du
workspace sont tous refusés. La réponse `found: false` est le signal
de l'agent que le chemin a été rejeté ; le plugin ne distingue pas
volontairement « manquant » de « hors workspace » (pour éviter de
divulguer la disposition du système de fichiers).

## Erreurs fréquentes

- **La root n'existe pas** : `docs_list` retourne `{ count: 0,
  truncated: false, docs: [] }`. Le plugin n'avertit pas.
- **Doc pas encore commité** : les fichiers non suivis sont quand même
  servis (le plugin lit depuis le système de fichiers, pas depuis git).
  Le `path` renvoyé est relatif au workspace.
- **L'inférence de titre échoue** : si le premier heading n'est pas
  `# ` (pas d'espace, mauvais niveau) et qu'il n'y a pas de
  frontmatter `title:`, le plugin utilise le basename du fichier
  (ex. `CHANGELOG.md` → `CHANGELOG.md`). Relancez après avoir
  corrigé le heading.

## Étape suivante

- [Comment `docs_list` s'intègre avec `memory_recall` pour « ce que j'ai sauvé + où était-ce documenté ? »](#)
- [Créer un index de connaissances avec le plugin `knowledge`](#)
