---
title: Débuter avec le plugin proposals
plugin: proposals
audience: orchestrateur / agent
order: 1
lang: fr
---

# Débuter avec le plugin proposals

Ce tutoriel part d'un workspace vierge et aboutit à un cycle
complet proposition → slice → implémentation → clôture, avec la
discipline du mutex de fichiers intacte. On suppose que le plugin
`proposals` est activé (voir `plugins/proposals/README.md` pour
le snippet JSON).

## 0. Le modèle mental

Une **proposition** est un fichier markdown avec un en-tête
frontmatter. Un **slice** est une section numérotée à l'intérieur.
Le plugin coordonne deux auteurs par slice : l'un réclame, l'autre
libère. `auto_work` est le point d'entrée haut niveau « que
dois-je faire ensuite ? ».

```
docs/mcp-vertex/proposals/
├─ index.json          (régénéré par sync_proposals)
├─ p<N>-<titre>.md    (une proposition)
│  ├─ ## Slices
│  │  ├─ s1-claim
│  │  ├─ s2-implement
│  │  └─ s3-close
```

## 1. Démarrer avec `auto_work`

`auto_work` renvoie le prochain slice actionnable dans l'ensemble
du store de propositions, avec un plan ordonné et compact. Le
plan doit être exécuté à la lettre, sans improviser.

```json
// Appel de l'outil MCP
{ "tool": "proposals_auto_work", "args": {} }

// Réponse typique (tronquée)
{
  "state": "work",
  "proposalId": "p110",
  "sliceId": "s1-claim",
  "steps": [
    "Ouvrir docs/mcp-vertex/proposals/p110-…md et choisir le prochain slice atomique.",
    "Réclamer ses fichiers : proposals_agent_lock { action: \"claim\", … }.",
    "Implémenter exactement ce slice — rien hors des fichiers réclamés.",
    "Valider selon le gate du projet (voir get_validation_matrix si présent).",
    "Marquer la progression dans la proposition, puis proposals_sync_proposals.",
    "Libérer : proposals_agent_lock { action: \"release\", task_id }."
  ]
}
```

## 2. Réclamer les fichiers du slice

L'outil `proposals_agent_lock` enregistre qui possède quels chemins
pendant la durée d'un slice. Sans réclamation, `sync_proposals`
refusera de marquer le slice comme terminé.

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

La réponse contient un `task_id` à conserver jusqu'à la libération.
Deux agents réclamant le même fichier ⇒ conflit, aucun progrès. Le
mutex est sauvegardé par le système de fichiers (non consultatif)
et survit aux redémarrages du processus.

## 3. Implémenter le slice, puis valider

Modifiez uniquement les fichiers réclamés. Exécutez le gate :

```bash
bun run validate
```

Si le gate échoue, corrigez le slice — n'élargissez pas la
réclamation en silence.

## 4. Marquer la progression et synchroniser

`sync_proposals` lit les fichiers de propositions, valide leur
frontmatter + plan de slices, et reconstruit `index.json`. C'est
rapide et idempotent.

```json
{ "tool": "proposals_sync_proposals", "args": {} }
```

## 5. Clore le slice

```json
{
  "tool": "proposals_close_slice",
  "args": {
    "proposalId": "p110",
    "sliceId": "s1-claim"
  }
}
```

Ceci réécrit le statut du slice à `done` dans la proposition,
supprime le verrou et re-synchronise l'index. Appelez ensuite
`auto_work` — il renverra le prochain slice (ou `state: "idle"`
si le store est épuisé).

## Erreurs fréquentes

- **Modifier des fichiers hors de la réclamation** : `sync_proposals`
  refusera de marquer le slice terminé. Utilisez un second slice
  avec sa propre réclamation, ou découpez la proposition.
- **Omettre `sync_proposals`** : l'index devient périmé. Le prochain
  agent demande « le prochain slice » et obtient le mauvais.
- **Oublier de libérer** : un verrou périmé bloque l'orchestrateur
  suivant pendant `staleMs` (défaut 30 s). Appelez
  `proposals_agent_lock { action: "gc" }` pour nettoyer.

## Étape suivante

- [Comment le plugin agent_worktree isole les agents concurrents](#)
- [Modes de persistance pour auto_work (p109)](../../p109-feat-auto-work-persist-modes.md)
- [Round context pour le travail repris](#)
