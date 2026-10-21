# external-mcps — completed source review

Snapshot: `bec5d5daf945df78464e4535c47628809ef8ca64`. Reviewer: gpt-6.1-sol. Production reading: **34/34 files**, complete ranges and SHA-256 in `coverage.json`; six package/config/skill metadata files read. Seven test files read, six executed: **33/33 tests pass** in an isolated scratch copy with workspace source aliases. Other test files remain pending; complete production reading does not certify every external provider.

The plugin composes declared stdio MCP servers. Catalog and suggestions stay offline; live npm discovery is disabled by default and bounded by a process-local rolling budget. Calls have a lazy registry, filtered child environment, initialization handshake, per-call timeout, manifest tool declarations and durable acknowledgement ledger. Capabilities add project conventions/style/framework context and compact external facts. Dependencies on conventions/framework-knowledge/style-convention are real imports; manifest dependencies understate this compared with package.json, but no installation failure was reproduced.

| Dimension | Score / 10 | Basis |
|---|---:|---|
| Functionality | 6 | Real implemented offline flow and lazy invocation; normalized child errors can become success. |
| Architecture | 7 | Injectable subprocess/clock/search seams and pure services; version metadata is disconnected from launch recipe. |
| Contracts and reliability | 5 | Explicit gates and machine outcomes, but D41 and EXT-03 break important failure semantics. |
| Governance and privacy | 5 | Child environment projection and durable ack are useful; raw cache bypasses promised redaction. |
| Tests and evidence | 6 | Six pertinent local suites pass; callback-heavy coverage misses protocol/result error cases; no live interoperability certification. |
| Token efficiency and usability | 7 | 10 catalog rows / 3 suggestions, bounded fact projection; raw answer is still fully materialized/written and no host-token savings measured here. |
| **Overall (unweighted mean)** | **6.0** | Source-backed score, not a claim of production deployment readiness. |

Confirmed new local findings are EXT-02 (pin not bound to recipe), EXT-03 (normalized child tool error erased) and EXT-04 (raw cache unredacted). Existing D41/EXT-01 is not duplicated. D95 is narrowed: internal map inputs are defective, but the public config only accepts NAME arrays. D101 is a missing readiness diagnostic, not proof that a live process is falsely marked running. G54/G101 must distinguish an absent executable allowlist from the activation policy that is actually enforced.

Own probes use fixed-snapshot external source, a fake child and captured registration callback. The raw cache probe uses a temporary local store with a synthetic marker; shareable logs show booleans and lengths, never a full marker. No external command, npm request, provider, credentials or spend is used. Core writer/redactor/config dependencies were hash-compared to the snapshot (see dependency-hashes.json); the full transitive workspace import graph was not archived or separately audited here.

The initial Vitest attempt failed before collecting tests because extracted tsconfig lacked its base. Adding that base only in scratch enabled the documented 33 passing tests; both logs are retained. Bun probes exit 0 and emit expected results, plus a Bun directory-mismatch diagnostic on stderr; this is recorded rather than presented as a clean stderr run. A first probe revision used a wrong redactor-result property, corrected to `.text` before the final evidence; the initial files are not primary evidence.

Remaining runtime work: SDK client/server matrix for all external error branches; real supported-language server roundtrips under explicit authorization; shutdown/timeout recovery and raw-cache retention limits; per-command verified version resolution. Existing unexecuted test specifications are explicitly pending in the ledger. No production fix was applied.
