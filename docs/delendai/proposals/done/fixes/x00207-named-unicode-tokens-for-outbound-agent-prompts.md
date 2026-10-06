---
id: x00207
title: "Named Unicode tokens for outbound agent prompts"
kind: fix
status: done
type: proposal
track: plugins+fix
date: 2026-08-23
shipped-in:
  - 61dccaaa # fix(orchestrator-runner): named Unicode tokens for outbound agent prompts
---

# x00207 — Named Unicode tokens for outbound agent prompts

## Goal

Keep agent invocations intact when text contains astral-plane characters (emoji such as U+1F433 whale, ZWJ sequences, unpaired surrogates, C0/C1 controls) by rewriting each grapheme into an ASCII, JSON-safe, named token a receiving or sending agent reads as meaning, never as a raw surrogate or hex-only escape. The whale becomes `[emoji:whale U+1F433]`.

## why

Some agent CLIs, JSON-RPC stdio framers, and host JSON parsers treat JavaScript strings as UTF-16. Astral-plane emoji become surrogate pairs; a truncated pair or a naive byte-length cut produces invalid UTF-8/JSON and the request is dropped. Observed with the whale emoji; the same class includes other supplementary-plane emoji, ZWJ sequences, and unpaired surrogates. A hex escape alone is not enough: many models treat a hex escape or replacement glyph as noise. The rewrite must carry a human/LLM-readable name plus the code point so both sender and receiver know it is a whale. The runner currently forwards the prompt verbatim on every kind (cli argv, NDJSON tools/call, HTTP JSON body, format_handoff).

## non-goals

- Rewriting status-marker close lines, audit severity tables, or web UI copy shown to a human host that already renders UTF-8
- Changing MCP Content-Length HTTP framing (stdio here is NDJSON)
- Normalizing NFC/NFD of ordinary BMP letters (accents, CJK) — they already round-trip
- Vendoring the full Unicode Character Database; use a compact emoji-name table plus a hex fallback
- A per-provider allowlist of safe emoji — the rewrite is uniform
- Translating emoji into another language at rewrite time; names are English CLDR/Unicode

## Slices

- global_gate: lint

### S1 — Named-token Unicode rewrite helper
- **Status**: done
- **Files**: `packages/core/src/lib/shared/unicode-safe-text.ts`, `packages/core/src/lib/contracts/interfaces/unicode-safe-text.interface.ts`, `packages/core/src/lib/shared/unicode-emoji-names.generated.ts`, `packages/core/tests/src/lib/shared/unicode-safe-text.spec.ts`, `packages/core/src/public/index.ts`
- **Gate**: lint
- acceptance:
  - "rewriteUnicodeForAgent is pure, no I/O, no process.cwd, no *Sync"
  - "each rewritten grapheme is ASCII `[kind:name U+XXXX]` (ZWJ sequences list every code point)"
  - "U+1F433 becomes `[emoji:whale U+1F433]` (name, not hex-only)"
  - "unknown astral code points become `[unicode:U+XXXXX]` never a raw surrogate"
  - "unpaired surrogates become `[unicode:replacement U+FFFD]`"
  - "ordinary BMP letters, digits, punctuation, accents, CJK stay unchanged"
  - "C0/C1 controls except tab/LF/CR become `[unicode:U+00XX]`"
  - "when any rewrite happens, a single ASCII legend line is prepended explaining the token grammar; no-op inputs get no legend"
  - "decodeUnicodeFromAgent round-trips named tokens back to the original grapheme"
  - "helper + types exported from @mcp-vertex/core/public"

### S2 — Apply named rewrite on every invoke hop
- **Status**: done
- **DependsOn**: [S1]
- **Files**: `plugins/orchestrator-runner/src/lib/invoke/manager.ts`, `plugins/orchestrator-runner/src/lib/subprocess/cli.ts`, `plugins/orchestrator-runner/src/lib/subprocess/mcp-client.ts`, `plugins/orchestrator-runner/src/lib/subprocess/api.ts`, `plugins/orchestrator-runner/src/lib/invoke/handoff.ts`, `plugins/orchestrator-runner/tests/src/lib/invoke/unicode-safe-prompt.spec.ts`
- **Gate**: lint
- acceptance:
  - "InvocationManager rewrites args.task once before planFallbackChain so every hop sees the same named-token prompt"
  - "cli argv, mcp-server tools/call params, api JSON body, and formatHandoff command all carry the named-token form (no raw U+1F433)"
  - "a prompt containing the whale serializes with JSON.stringify as ASCII `[emoji:whale U+1F433]` and the legend is present"
  - "existing manager.spec.ts spend-guard cases still pass"

## acceptance

- rewriteUnicodeForAgent is pure, no I/O, no process.cwd, no *Sync
- each rewritten grapheme is ASCII `[kind:name U+XXXX]` (ZWJ sequences list every code point)
- U+1F433 becomes `[emoji:whale U+1F433]` (name, not hex-only)
- unknown astral code points become `[unicode:U+XXXXX]` never a raw surrogate
- unpaired surrogates become `[unicode:replacement U+FFFD]`
- ordinary BMP letters, digits, punctuation, accents, CJK stay unchanged
- C0/C1 controls except tab/LF/CR become `[unicode:U+00XX]`
- when any rewrite happens, a single ASCII legend line is prepended explaining the token grammar; no-op inputs get no legend
- decodeUnicodeFromAgent round-trips named tokens back to the original grapheme
- helper + types exported from @mcp-vertex/core/public
- InvocationManager rewrites args.task once before planFallbackChain so every hop sees the same named-token prompt
- cli argv, mcp-server tools/call params, api JSON body, and formatHandoff command all carry the named-token form (no raw U+1F433)
- a prompt containing the whale serializes with JSON.stringify as ASCII `[emoji:whale U+1F433]` and the legend is present
- existing manager.spec.ts spend-guard cases still pass
