---
title: Installer et lancer
description: Installez delendai, raccordez-le à votre IDE, choisissez un preset et vérifiez le serveur avant de commencer à travailler.
order: 1
navLabel: Installer
---

# Installer et lancer

Ajoutez delendai à votre flux de travail, pointez votre client MCP vers le binaire, puis vérifiez l'ensemble de plugins résolu avant la première session.

## Choisissez votre gestionnaire de paquets

Tous les gestionnaires ci-dessous exécutent le même paquet publié. Choisissez celui que votre équipe utilise déjà et gardez les commandes exactement telles quelles.

### npm

Node Package Manager est livré avec Node.js, c'est donc le choix universel le plus sûr lorsque vous avez besoin de la compatibilité la plus large entre machines et runners CI.

```bash
npx -y @delendai/cli init
npx -y @delendai/cli validate
```

### pnpm

pnpm est rapide, économe en disque et strict sur la résolution des dépendances, ce qui en fait un très bon choix pour les monorepos ou les équipes déjà standardisées sur pnpm.

```bash
pnpm dlx @delendai/cli init
pnpm dlx @delendai/cli validate
```

### yarn

Yarn reste une alternative familière dans de nombreux projets JavaScript, donc cette voie fonctionne bien lorsque vos outils et les habitudes de l'équipe tournent déjà autour de Yarn.

```bash
yarn dlx @delendai/cli init
yarn dlx @delendai/cli validate
```

### bun

bun réunit runtime et gestionnaire de paquets dans un seul outil, et delendai lui-même est construit avec bun, ce qui en fait la voie la plus directe quand bun est déjà disponible sur la machine.

```bash
bunx @delendai/cli init
bunx @delendai/cli validate
```

### deno

Deno peut exécuter directement le paquet npm, ce qui est utile si vous préférez un runtime sécurisé par défaut avec un support TypeScript de premier ordre et la compatibilité npm.

```bash
deno run -A npm:@delendai/cli init
deno run -A npm:@delendai/cli validate
```

## Choisissez votre IDE

Les extraits ci-dessous utilisent le preset solo avec bun. Collez le JSON tel quel dans le fichier cible, puis laissez votre IDE enregistrer le serveur stdio.

### VS Code

Fichier : .vscode/mcp.json
Portée : projet

```json
{
  "servers": {
    "delendai": {
      "type": "stdio",
      "command": "bunx",
      "args": [
        "--package",
        "@delendai/cli",
        "delendai",
        "__serve",
        "--workspace",
        ".",
        "--preset",
        "solo"
      ]
    }
  }
}
```

### Cursor

Fichier : .cursor/mcp.json ou ~/.cursor/mcp.json
Portée : projet / global

```json
{
  "mcpServers": {
    "delendai": {
      "command": "bunx",
      "args": [
        "--package",
        "@delendai/cli",
        "delendai",
        "__serve",
        "--workspace",
        ".",
        "--preset",
        "solo"
      ]
    }
  }
}
```

### Windsurf

Fichier : ~/.codeium/windsurf/mcp_config.json
Portée : global

```json
{
  "mcpServers": {
    "delendai": {
      "command": "bunx",
      "args": [
        "--package",
        "@delendai/cli",
        "delendai",
        "__serve",
        "--workspace",
        ".",
        "--preset",
        "solo"
      ]
    }
  }
}
```

### Claude Code

Fichier : .mcp.json ou via claude mcp add
Portée : projet

```json
{
  "mcpServers": {
    "delendai": {
      "command": "bunx",
      "args": [
        "--package",
        "@delendai/cli",
        "delendai",
        "__serve",
        "--workspace",
        ".",
        "--preset",
        "solo"
      ]
    }
  }
}
```

### Claude Desktop

Fichier : claude_desktop_config.json
Portée : global

```json
{
  "mcpServers": {
    "delendai": {
      "command": "bunx",
      "args": [
        "--package",
        "@delendai/cli",
        "delendai",
        "__serve",
        "--workspace",
        ".",
        "--preset",
        "solo"
      ]
    }
  }
}
```

### Antigravity

Fichier : ~/.gemini/antigravity-ide/mcp_config.json
Portée : global

```json
{
  "mcpServers": {
    "delendai": {
      "command": "bunx",
      "args": [
        "--package",
        "@delendai/cli",
        "delendai",
        "__serve",
        "--workspace",
        ".",
        "--preset",
        "solo"
      ]
    }
  }
}
```

### Zed

Fichier : settings.json
Portée : global

```json
{
  "context_servers": {
    "delendai": {
      "command": "bunx",
      "args": [
        "--package",
        "@delendai/cli",
        "delendai",
        "__serve",
        "--workspace",
        ".",
        "--preset",
        "solo"
      ]
    }
  }
}
```

## Choisissez un preset

Les presets sont additifs. Commencez petit, puis élargissez la surface de plugins uniquement quand votre flux de travail en a réellement besoin.

### minimal

Usage recommandé : orientation en lecture seule et smoke tests CI.
Taille : 2 plugins · 42 outils · ~11805 tokens au démarrage

- git
- search

### solo

Usage recommandé : un développeur et un agent au travail quotidien ; la valeur par défaut de `init`.
Taille : 10 plugins · 79 outils · ~19037 tokens au démarrage

- git
- search
- memory
- docs
- quality
- rules
- deps
- test-policy
- env
- refactor

### team-pr

Usage recommandé : une équipe qui travaille par pull requests, avec des conventions de commit et de tests.
Taille : 18 plugins · 116 outils · ~25446 tokens au démarrage

- git
- search
- memory
- docs
- quality
- rules
- deps
- test-policy
- env
- refactor
- forge
- commit-policy
- conventions
- test-convention
- security
- web-fetch
- status-marker
- error-reporting

### swarm

Usage recommandé : plusieurs agents partageant un checkout, avec propositions, logs et marqueurs de clôture.
Taille : 19 plugins · 125 outils · ~26802 tokens au démarrage

- git
- search
- memory
- docs
- quality
- test-policy
- proposals
- error-reporting
- logs
- agent-orchestrator
- auto-agent-selector
- notification
- completion
- status-marker
- forge
- commit-policy
- conventions
- test-convention
- usage-tracking

### audit

Usage recommandé : revues et audits en lecture seule.
Taille : 15 plugins · 89 outils · ~21955 tokens au démarrage

- git
- search
- docs
- audit
- security
- web-fetch
- deps
- tech-debt
- link-check
- project-health
- impact-analysis
- refactor
- quality
- test-policy
- logs

### docs-web

Usage recommandé : documentation et sites web.
Taille : 8 plugins · 61 outils · ~15696 tokens au démarrage

- git
- search
- memory
- docs
- i18n
- link-check
- web-fetch
- env

### everything

Usage recommandé : diagnostic avec tous les plugins publiés, y compris ceux qui utilisent le réseau ou des identifiants.
Taille : 58 plugins · 236 outils · ~59122 tokens au démarrage

- adaptive-optimizer
- agent-orchestrator
- api
- audit
- audit-orchestrator
- auto-agent-selector
- auto-plugin-selector
- browser
- cache
- commit-policy
- completion
- container
- context-for-change
- conventions
- database
- deps
- diagram
- docs
- env
- error-reporting
- execution-env
- external-mcps
- forge
- framework-knowledge
- git
- github
- gitlab
- i18n
- impact-analysis
- issues
- link-check
- logs
- memory
- notification
- observability
- orchestrator-runner
- perf
- project-health
- project-kpis
- prompt-eval
- prompts-pack
- proposals
- quality
- quality-policy
- refactor
- remote-provider-core
- rules
- search
- security
- self-learning
- skills-pack
- status-marker
- style-convention
- tech-debt
- test-convention
- test-policy
- usage-tracking
- web-fetch

## Vérifier

Une fois la configuration en place, lancez un auto-contrôle avec le même gestionnaire de paquets que pour l'installation. Remplacez `bunx` par `npx`, `pnpm dlx`, `yarn dlx` ou `deno run -A npm:` si c'est votre chemin choisi.

```bash
bunx @delendai/cli validate
bunx @delendai/cli --preset=swarm --exclude-plugins=notification validate
```

Utilisez `--exclude-plugins=` lorsque vous voulez retirer un plugin d'un preset sans le forker, par exemple pour garder la base swarm mais supprimer notification dans une session mono-agent.

## FAQ

### Pourquoi `deno run -A npm:@delendai/cli` démarre-t-il lentement ?

Deno résout et vérifie le paquet npm lors du premier usage. Les exécutions suivantes réutilisent le cache dans `~/.cache/deno`, mais pour des lancements locaux répétés bun ou npx démarrent encore plus vite.

### Mon IDE n'est pas listé. Que faire ?

Tout IDE qui accepte un serveur MCP en stdio peut exécuter le même serveur. Partez du JSON VS Code, remplacez le chemin de fichier par celui attendu par votre IDE et gardez la même commande avec les mêmes arguments.

### Puis-je exécuter plusieurs presets à la fois ?

Non. Une instance du serveur ne résout qu'un seul preset à la fois. Si différents projets ont besoin de jeux de plugins distincts, placez un delendai.config.json dédié dans chaque projet et laissez le loader le résoudre par workspace.