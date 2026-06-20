---
title: Enregistrer et rappeler des notes mémoire
plugin: memory
audience: tout agent ayant besoin de continuité entre les sessions
order: 1
lang: fr
---

# Enregistrer et rappeler des notes mémoire

Ce tutoriel présente les quatre outils `memory_*` en action. Les notes
sont de petits enregistrements JSON sous `.cache/mcp-vertex/memory/notes.json`
— assez petits pour être vidés en entier, indexés par id, récupérables
par tag ou requête plein texte.

## 0. Le modèle mental

Une **note** est `{ id, title, body, tags, createdAt, updatedAt }`.
Les titres sont uniques (insensible à la casse) — `memory_save` effectue
un upsert par titre. Il n'y a pas de schéma pour `body` ; traitez-le
comme un champ de texte libre court. Les secrets sont auto-expurgés par
`redactSecrets` avant que la note soit persistée (voir
`packages/core/src/lib/shared/redact.ts`).

## 1. Enregistrer une note

```json
{
  "tool": "memory_save",
  "args": {
    "title": "ordre de publication monorepo",
    "body": "core en premier, puis les plugins en verrouillage. derive-version.ts lit les Conventional Commits depuis le dernier tag vX.Y.Z.",
    "tags": ["release", "monorepo"]
  }
}
```

Réponse : `{ id: "<uuid>", createdAt: "..." }`. Save renvoie l'id
pour pouvoir l'oublier plus tard.

## 2. Rappeler par requête

```json
{
  "tool": "memory_recall",
  "args": {
    "query": "ordre de publication",
    "limit": 5
  }
}
```

Renvoie jusqu'à `limit` notes correspondant à la requête (correspondance
de sous-chaîne sur titre + body, classées par récence). Utilisez `tags`
plutôt que (ou en plus de) `query` pour affiner :

```json
{
  "tool": "memory_recall",
  "args": { "tags": ["release"], "limit": 10 }
}
```

## 3. Lister à faible coût

`memory_list` renvoie seulement `{ id, title, tags }` — l'index. À
utiliser quand vous ne souhaitez pas encore récupérer les bodies :

```json
{ "tool": "memory_list", "args": { "limit": 50 } }
```

## 4. Oublier

```json
{ "tool": "memory_forget", "args": { "id": "<uuid>" } }
```

`memory_forget` est une suppression définitive — il n'y a pas de
suppression douce / archive. L'id disparaît ; le titre est libéré
pour un futur `memory_save`.

## Erreurs fréquentes

- **Secrets dans `body`** : même si le plugin expurge à la sauvegarde,
  ne collez pas de tokens bruts ou de valeurs de style `.env` — la
  redaction est heuristique, pas parfaite.
- **Collisions de titre** : `memory_save` effectue un upsert par titre.
  Si deux agents sauvegardent le même titre en parallèle, le second
  écraseur gagne et le premier est perdu. Utilisez des titres uniques
  par slice / par problème.
- **Recall trop de résultats** : préférez `tags` à une `query` large.
  Une query de `""` renvoie tout trié par récence — utile pour
  « qu'ai-je sauvegardé la dernière session ? » mais coûteux sur un
  store complet.

## Étape suivante

- [Comment round_context (proposals) lie les notes mémoire aux propositions actives](../../proposals/tutorials/fr/getting-started.md)
- [Contrat de redaction des secrets](https://github.com/CartagoGit/mcp-vertex/blob/main/packages/core/src/lib/shared/redact.ts)
