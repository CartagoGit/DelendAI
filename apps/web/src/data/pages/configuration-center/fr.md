---
title: Centre de configuration
description: Configurez les plugins delendai et consultez la provenance des artefacts depuis VS Code.
order: 2
navLabel: Configuration
---

# Centre de configuration

Lancez **DelendAI: Open Configuration Center** dans VS Code et choisissez le projet si la fenêtre a plusieurs racines. Les sections couvrent les réglages généraux, plugins, fournisseurs, agents, compétences, prompts, ressources et connaissances, avec propriétaire et provenance.

## Modification sûre

Seul `delendai.config.json` est modifié. Les préférences de lancement, thème et langue restent dans VS Code. L’enregistrement vérifie l’empreinte exacte, fusionne les chemins modifiés, valide tout le document et remplace le fichier atomiquement. Les champs inconnus et serveurs externes désactivés sont conservés. En cas de conflit, rechargez puis réappliquez la modification.

Les secrets sont masqués. `env` contient uniquement des noms de variables. Redémarrez le serveur après un changement.

## Auteurs de plugins

Déclarez `optionsSchema` dans `definePlugin(...)` et gardez `configExample.options` valide. Les plugins locaux déclarés par `plugins.<id>.path` et les enfants MCP externes apparaissent automatiquement avec leur schéma et provenance.
