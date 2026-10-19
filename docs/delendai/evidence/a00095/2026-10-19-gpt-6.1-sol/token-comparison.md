# MCP surface comparison and cost limitations

Auditor: `gpt-6.1-sol` (Codex). Source snapshot: `514758e783620c8953079be4d71fceccacb3de8b`.

The same local read task was replayed using native, managed and adaptive MCP surfaces with real server composition and an SDK client. The measured cycle includes discovery and invocation JSON-RPC traffic. Managed/adaptive used more requests and fewer transported bytes for this task.

The observed managed/native byte reduction was 62.6% in that scenario. It is not measured host token savings, end-to-end billing, automatic relisting behavior or a general economic guarantee. Both text and structured channels must be counted at their actual transport boundary.

## Complete original and evidence

[Read the complete signed Spanish reviewer source](evidence/reviewer-originals/token-comparison.source.es.txt). It is preserved byte-for-byte, including all detailed arguments, tables, qualifications and replay commands. This English page is a navigation and scope summary, **not a full translation**. The original remains primary evidence.

The joint proposal is intentionally bilingual. Public documentation pages follow the repository English-language rule; original reviewer material is retained as a source attachment. No gate, exclusion, baseline or product code was changed.

[Current plugin coverage](completion-coverage.json) · [Per-identifier verdicts](prior-findings.json) · [Indexed findings](findings.json) · [Replay evidence hashes](evidence-manifest.json)
