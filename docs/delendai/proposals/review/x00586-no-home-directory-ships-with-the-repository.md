---
id: x00586
title: "No home directory ships with the repository"
kind: fix
status: review
type: proposal
track: trust
date: 2026-09-21
tags:
    - privacy
    - adoption
---

# x00586 — No home directory ships with the repository

## goal

Cloning this repository, or adopting delendai in another project, never
carries somebody else's machine along with it.

## why

Reported and then confirmed: a clone on a different computer showed the
author's local folder. Two **tracked, live configuration** files held it:

```
.claude/settings.json
  "additionalDirectories": ["/home/<user>/_projects/delendai"]

config/external/cursor/cursorrules
  [AGENTS.md](file:///home/<user>/_projects/delendai/AGENTS.md)
```

The first travels to every clone. The second describes how an assistant
should read this project, and links every document by a path that exists
on exactly one computer — so in any other checkout the rules point at
nothing.

This class of leak has shipped before, and the codebase says so:
`host-entry-resolver.service.ts` documents that it *"replaces the
previous hardcoded `/home/<user>/_proyectos/propios/delendai/tools/…`
that shipped in every generated `.vscode/mcp.json`."* It was fixed once,
in one place, by hand — and nothing stopped the next one.

An absolute home path in a tracked file is always one of two things: a
leak of whose machine this was, or a path that is wrong on every other
computer. Usually both.

## non-goals

- Rewriting historical prose. An audit that quotes a terminal session is
  a record; changing it would falsify what was observed, and it is
  installed nowhere.
- Forbidding absolute paths as such. `/usr/bin/env` and `/etc/hosts` are
  the same everywhere and say nothing about anybody.

## architecture

The two live files stop naming a home directory: the editor setting
carries no additional directory, and the Cursor rules link
repository-relative paths, which is what they were describing all along.

`lint:no-home-directory` refuses a home-shaped absolute path in any
tracked file, on all three platforms. `docs/delendai/proposals/done|legacy|retired`
are skipped as records. Everything that exists today is baselined, so
the rule bites on what arrives next and the remaining debt is visible
rather than forgotten.

## slices

### S1 — the two live files, and a rule so there is no third

- **Status**: review
- **Files**: [`.claude/settings.json`, `config/external/cursor/cursorrules`, `tools/scripts/lint/no-home-directory-in-tracked-files.script.ts`, `tools/scripts/lint/no-home-directory-in-tracked-files.constant.ts`, `tools/scripts/lint/no-home-directory-in-tracked-files.interface.ts`, `tools/scripts/lint/no-home-directory-in-tracked-files.script.spec.ts`, `tools/scripts/lint/no-home-directory-in-tracked-files.baseline.json`, `package.json`]
- **Gate**: `bun run lint:no-home-directory`

## acceptance

- Neither live file names a home directory.
- The rule finds the exact two shapes that shipped, on Linux, macOS and
  Windows spellings.
- It says nothing about a path that is identical on every machine.
- It reports file and line.
- Historical prose is skipped; live configuration is not.

## risks and mitigations

- **A baselined file is edited and the path stays.** The baseline is
  per file, so the rule still refuses a *new* file. Shrinking it is the
  follow-up the visible debt invites.
