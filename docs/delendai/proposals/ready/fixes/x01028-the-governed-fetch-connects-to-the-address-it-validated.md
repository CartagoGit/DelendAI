---
id: x01028
title: "The governed fetch connects to the address it validated"
kind: fix
status: ready
type: proposal
track: general
date: 2026-11-04
last-transition-id: 188589ce-3201-46e1-b7b3-c4ffd0fea663
last-correlation-id: 188589ce-3201-46e1-b7b3-c4ffd0fea663
last-transition-from: review
last-transition-at: 2026-11-04T20:30:47.785Z
---

# x01028 — The governed fetch connects to the address it validated

## goal

web-fetch (and every plugin call that goes through the governed fetch engine) connects to the IP address it already checked against the address policy, so a hostile resolver cannot answer differently between the check and the connection.

## why

External review in a ChatGPT conversation about develop (reviewer active 2026-10-20 to 2026-10-29). Remark of 2026-10-27: the web-fetch engine resolves the host and blocks private and metadata addresses (good), but the code itself admits that the connection resolves the name again, so without pinning the validated IP to the connection a DNS answer can change between the check and the connect. The reviewer called it a declared limitation, P2, and said network isolation is not yet proven against an adversary. Repeated as pending on 2026-10-29. Verified in the code on develop (3188f9414, 2026-11-04): plugins/web-fetch/src/lib/services/engine.ts line 24 still states that the connection re-resolves the name; x00951 (done) routed every plugin call through this engine but left the limitation. Product principles (AGENT-BOOTSTRAP section 0): bounded, a limit an agent cannot talk past; robust.

## non-goals

- Changing which hosts a project allows.

## slices

- global_gate: type

### S1 — The connection uses the validated address
- **Status**: pending
- **Files**: `plugins/web-fetch/src/lib/services/engine.ts`, `plugins/web-fetch/src/lib/services/pinned-connection.ts`, `plugins/web-fetch/src/lib/contracts/interfaces/fetch.interface.ts`, `plugins/web-fetch/README.md`, `plugins/web-fetch/tests/src/lib/services/engine.spec.ts`, `plugins/web-fetch/tests/src/lib/services/pinned-connection.spec.ts`
- **Gate**: type
- acceptance:
  - "The request connects to the IP that passed the address policy while the Host header and the TLS name stay the requested host."
  - "A resolver that answers a public address first and a private one second cannot reach the private one (spec)."
  - "The comment that admits the second resolution is removed because it is no longer true."
- shipped-in: `7f77000da636`
- review-state: changes_requested
- review-implementer: claude-opus-5-5
- review-reviewer: gpt-5.3-codex
- review-log: requested_changes by gpt-5.3-codex — Rework required: while I do not see post-shipped drift in listed files from 7f77000da636, this submission does not include current-run empirical evidence proving all three acceptance criteria on develop (pinned IP connect path, rebinding-block spec behavior, and removed stale comment). Please attach reproducible evidence and resubmit.

## acceptance

- The request connects to the IP that passed the address policy while the Host header and the TLS name stay the requested host.
- A resolver that answers a public address first and a private one second cannot reach the private one (spec).
- The comment that admits the second resolution is removed because it is no longer true.
