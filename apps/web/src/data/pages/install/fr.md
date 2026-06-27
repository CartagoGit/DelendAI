---
title: Installer et lancer
description: Installez mcp-vertex, raccordez-le à votre IDE, choisissez un preset et vérifiez le serveur avant de commencer à travailler.
order: 1
navLabel: Installer
---

# Installer et lancer

Ajoutez mcp-vertex à votre flux de travail, pointez votre client MCP vers le binaire, puis vérifiez l'ensemble de plugins résolu avant la première session.

## Choisissez votre gestionnaire de paquets

Tous les gestionnaires ci-dessous exécutent le même paquet publié. Choisissez celui que votre équipe utilise déjà et gardez les commandes exactement telles quelles.

### npm

Node Package Manager est livré avec Node.js, c'est donc le choix universel le plus sûr lorsque vous avez besoin de la compatibilité la plus large entre machines et runners CI.

```bash
npx -y @mcp-vertex/core init
npx -y @mcp-vertex/core --check
```

### pnpm

pnpm est rapide, économe en disque et strict sur la résolution des dépendances, ce qui en fait un très bon choix pour les monorepos ou les équipes déjà standardisées sur pnpm.

```bash
pnpm dlx @mcp-vertex/core init
pnpm dlx @mcp-vertex/core --check
```

### yarn

Yarn reste une alternative familière dans de nombreux projets JavaScript, donc cette voie fonctionne bien lorsque vos outils et les habitudes de l'équipe tournent déjà autour de Yarn.

```bash
yarn dlx @mcp-vertex/core init
yarn dlx @mcp-vertex/core --check
```

### bun

bun réunit runtime et gestionnaire de paquets dans un seul outil, et mcp-vertex lui-même est construit avec bun, ce qui en fait la voie la plus directe quand bun est déjà disponible sur la machine.

```bash
bunx @mcp-vertex/core init
bunx @mcp-vertex/core --check
```

### deno

Deno peut exécuter directement le paquet npm, ce qui est utile si vous préférez un runtime sécurisé par défaut avec un support TypeScript de premier ordre et la compatibilité npm.

```bash
deno run -A npm:@mcp-vertex/core init
deno run -A npm:@mcp-vertex/core --check
```

## Choisissez votre IDE

Les extraits ci-dessous utilisent le preset standard avec bun. Collez le JSON tel quel dans le fichier cible, puis laissez votre IDE enregistrer le serveur stdio.

### VS Code

Fichier : .vscode/mcp.json
Portée : projet

```json
{
  "servers": {
    "mcp-vertex": {
      "type": "stdio",
      "command": "bunx",
      "args": [
        "@mcp-vertex/core",
        "--preset=standard"
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
    "mcp-vertex": {
      "command": "bunx",
      "args": [
        "@mcp-vertex/core",
        "--preset=standard"
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
    "mcp-vertex": {
      "command": "bunx",
      "args": [
        "@mcp-vertex/core",
        "--preset=standard"
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
    "mcp-vertex": {
      "command": "bunx",
      "args": [
        "@mcp-vertex/core",
        "--preset=standard"
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
    "mcp-vertex": {
      "command": "bunx",
      "args": [
        "@mcp-vertex/core",
        "--preset=standard"
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
    "mcp-vertex": {
      "command": "bunx",
      "args": [
        "@mcp-vertex/core",
        "--preset=standard"
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
    "mcp-vertex": {
      "command": "bunx",
      "args": [
        "@mcp-vertex/core",
        "--preset=standard"
      ]
    }
  }
}
```

## Choisissez un preset

Les presets sont additifs. Commencez petit, puis élargissez la surface de plugins uniquement quand votre flux de travail en a réellement besoin.

### minimal

Usage recommandé : orientation en lecture seule et smoke tests CI.
Taille : 2 plugins.

- git
- search

### standard

Usage recommandé : travail mono-agent avec mémoire, docs, aide lint, types et dépendances.
Taille : 7 plugins.

- git
- search
- memory
- docs
- rules
- quality
- deps

### swarm

Usage recommandé : coordination multi-agent avec verrous, notifications, logs et marqueurs de clôture. Audit reste opt-in et doit être chargé séparément à la fin d'un round.
Taille : 13 plugins.

- git
- search
- memory
- docs
- rules
- quality
- deps
- proposals
- notification
- logs
- status-marker
- test-convention
- conventions

### full

Usage recommandé : le preset swarm plus les intégrations host-only comme web-fetch et issues, lorsque l'hôte les expose.
Taille : 15 plugins.

- git
- search
- memory
- docs
- rules
- quality
- deps
- proposals
- notification
- logs
- status-marker
- test-convention
- conventions
- web-fetch
- issues

## Vérifier

Une fois la configuration en place, lancez un auto-contrôle avec le même gestionnaire de paquets que pour l'installation. Remplacez `bunx` par `npx`, `pnpm dlx`, `yarn dlx` ou `deno run -A npm:` si c'est votre chemin choisi.

```bash
bunx @mcp-vertex/core --check
bunx @mcp-vertex/core --preset=swarm --exclude-plugins=notification --check
```

Utilisez `--exclude-plugins=` lorsque vous voulez retirer un plugin d'un preset sans le forker, par exemple pour garder la base swarm mais supprimer notification dans une session mono-agent.

## FAQ

### Pourquoi `deno run -A npm:@mcp-vertex/core` démarre-t-il lentement ?

Deno résout et vérifie le paquet npm lors du premier usage. Les exécutions suivantes réutilisent le cache dans `~/.cache/deno`, mais pour des lancements locaux répétés bun ou npx démarrent encore plus vite.

### Mon IDE n'est pas listé. Que faire ?

Tout IDE qui accepte un serveur MCP en stdio peut exécuter le même serveur. Partez du JSON VS Code, remplacez le chemin de fichier par celui attendu par votre IDE et gardez la même commande avec les mêmes arguments.

### Puis-je exécuter plusieurs presets à la fois ?

Non. Une instance du serveur ne résout qu'un seul preset à la fois. Si différents projets ont besoin de jeux de plugins distincts, placez un mcp-vertex.config.json dédié dans chaque projet et laissez le loader le résoudre par workspace.