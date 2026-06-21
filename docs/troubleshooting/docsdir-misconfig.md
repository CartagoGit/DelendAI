---
slug: docsdir-misconfig
symptom: "After setting `cacheDir` or `docsDir` in `mcp-vertex.config.json`, the `proposals` plugin's state (locks, task queue, round-context) appears to reset or split across two locations — agents stop seeing each other's claims."
cause: "`cacheDir`/`docsDir` are core-level overrides and **do** affect the core and most plugins, but the `proposals` plugin's swarm state is keyed off the *resolved* cache path at the moment each tool call runs. If `cacheDir` is changed mid-session (not just at boot), already-running agents keep writing to the old resolved path while new tool calls resolve the new one — the same logical swarm now has two disjoint state directories."
fix: "Treat `cacheDir`/`docsDir` as boot-time configuration only: set them once in `mcp-vertex.config.json` before the host process starts, and restart every agent's host connection after changing either value. Do not hot-swap them mid-session. If state already split, run `state_health` then `state_repair` (the `proposals` plugin's recovery tools) to reconcile the two directories before resuming work."
tags: [config, proposals, multi-agent]
closedBy: "n00001 session resume (F3 follow-up)"
---

This is a configuration-change-during-a-live-session problem, not a bug in
either value's resolution logic — `--cacheDir`/`--docsDir` are read once at
boot by design (the same invariant that keeps `process.cwd()` out of the
core's hot paths also means config overrides are not re-read per call).
