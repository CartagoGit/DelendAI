---
id: x01060
title: "The @hono/node-server override is raised past its advisories"
kind: fix
status: ready
type: proposal
track: general
date: 2026-11-12
---

# x01060 — The @hono/node-server override is raised past its advisories

## goal

The dependency-advisories gate passes again: the @hono/node-server pin moves from 2.1.3 to the first version past GHSA-qv5m-9pm6-hqp3 and GHSA-jpvv-r467-5p4w.

## why

TODO: why this work matters now.

## non-goals

- TODO: what this proposal deliberately skips.

## slices

- global_gate: none

### S1 — Raise the @hono/node-server pin to 2.1.6
- **Status**: pending
- **Files**: `package.json`, `bun.lock`
- **Gate**: none
- acceptance:
  - "The root overrides pin @hono/node-server at 2.1.6, the first release past both advisories"
  - "bun.lock resolves @hono/node-server to 2.1.6"
  - "bun tools/scripts/lint/dependency-advisories.script.ts reports no @hono/node-server advisory"

## acceptance

- The root overrides pin @hono/node-server at 2.1.6, the first release past both advisories
- bun.lock resolves @hono/node-server to 2.1.6
- bun tools/scripts/lint/dependency-advisories.script.ts reports no @hono/node-server advisory
