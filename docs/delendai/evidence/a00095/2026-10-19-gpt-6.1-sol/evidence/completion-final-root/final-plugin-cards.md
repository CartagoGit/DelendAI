# Continued plugin source review

Auditor: `gpt-6.1-sol` (Codex), 2026-10-20. Source: `bec5d5daf945df78464e4535c47628809ef8ca64`. Same-model delegates contribute to one reviewer. Complete source reads are recorded in the linked ledgers; pending tests, other plugins and real-host work remain separate.

## Rules — provisional 7/10

Implemented framework detection, project-first linter/type configuration, dogmas, composition registries and strict/mixed/none/proposal modes. The delegate completed 184 production entries / 10,093 lines; metadata and selected tests are separately classified. The entrypoint and rule tools use `buildManifestViaComposition`; the legacy builder is retirement debt, not a second productive authority (G13).

Three tools register with output schemas. `get_rules` has an explicit compact projection; `check_rules` and `apply_rules` describe plans and prerequisites rather than proving that the host subsequently executes them. PATH detection uses async stat with platform delimiters/PATHEXT, not shell discovery. The registry pattern and explicit project precedence are strengths. Boot materializes default cache files with atomic writes and guards manifest updates with a mutex; this is a startup side effect, not an in-memory-only reader. Failure is intentionally best effort and tools can build an in-memory manifest. Network/registry suggestions still require controlled validation before being called proof of installed compatibility.

Measured in-memory MCP listing: **3 tools, 6,166 definition bytes**, input schemas 520 B and output schemas 4,700 B. The manifest's legacy shared budget refers to 3,000 B; see SURF-01. These are serialized bytes under the fixture namespace, not tokens or measured end-to-end task savings. Composition and rule-tool specs passed in the focused eight-file run. No new independent correctness defect is claimed here beyond the measured budget divergence and already identified legacy debt. Full real host, Windows executable permission semantics and the complete spec family remain unverified in this continuation.

## Search — provisional 5/10

Implemented lexical, regex, symbol/reference and opt-in semantic/hybrid search. The delegate completed 24 production entries / 3,449 lines. Workspace roots, safe reader and ignored directories constrain discovery; result count and preview limits reduce routine payload. Missing configured roots return a diagnostic, a positive contract the context-for-change caller currently loses (G82).

Semantic mode chooses the local deterministic embedder without consent; a provider is selected only after consent and available configuration. This continuation uses deterministic injected embedders and never examines provider keys. Provider availability is not a proof of paid execution success. The parser/embedding tests passed but omit identical-content distinct files and changing embedder identity against a warm cache.

SEARCH-01 and SEARCH-02 below reproduce those omissions through the real pipeline, with owned source files and an in-memory index port. They impair semantic recall and make rankings compare vectors from incompatible spaces; lexical mode is unaffected by those paths. Measured listing: **3 tools, 4,163 definition bytes**, input schemas 1,029 B, output schemas 1,871 B, against the 3,000 B hard cap. Treat this as byte-budget drift, not a measured token invoice. Separate vector content cache from path membership and include model/version/dimension in the cache identity.

## Issues — provisional 5/10

Implemented GitHub issue ingest/analyze/resolve, read/list surfaces, one-time setup and an opt-in error sink. The delegate completed 30 production entries / 3,870 lines. Proposals is an explicit dependency. Without repo configuration only setup plus explanatory knowledge is registered; configured fixtures expose ten tools, including setup. Auto-report defaults false and reports are rate-limited. The read/write ports are injected, so offline checking does not require a GitHub request. Caller checkout selection, path containment, redaction and mutex-plus-atomic resolve are positive controls.

ISSUES-01 demonstrates that a multiline comment is not round-tripped: its second line terminates the parser's comment block, which also drops following comment metadata. A later resolve parses and rewrites the scaffold, making the local data loss durable. The original GitHub issue remains untouched by this experiment; the pure serializer/parser is the execution boundary. Existing frontmatter tests cover colons/hashes but not this case.

Measured configured listing: **10 tools, 15,101 definition bytes**, input schemas 1,867 B, output schemas 10,701 B. Manifest staticBytes is 4,900 and hard cap 5,900. Output schemas dominate; preserve contract detail through a measured discovery strategy rather than deleting validation. No actual setup, GitHub mutation, credential bootstrap or issue creation was executed. Full live permissions and error-sink hour-window behavior remain open.

## Roadmap — provisional 5/10

Implemented versioned roadmap authority, timeline, readiness/delta/promotion advice and explicit plan init/close. The delegate completed all 56 source files plus metadata and selected tests. It is private/experimental, in no default preset; no declared roadmap means no tools, with availability explaining configuration. Every path is physically constrained to the caller checkout; the plugin informs promotion and does not itself merge, tag, bump or publish. This separation, strict schema version refusal and recorded reasons are strengths.

The real workspace helper misclassifies an archived done proposal as `legacy` because it reads the top-level directory rather than canonical status (ROAD-01). The close handler selects one detail for transition validation but changes every matching ID across horizons, while the schema accepts duplicate IDs (ROAD-02). The attached probe uses an owned temporary docs tree for status and captured real handler with in-memory ports for close; it does not run a release or alter a real roadmap.

The candidate that a release candidate must not count as published was **not** promoted to a confirmed defect. `roadmap-delta.service.spec.ts:93` deliberately expects that behavior; the implementation compares numeric parts. A prerelease policy change may be desirable, but requires product agreement and should not be disguised as a missed implementation of the existing test contract.

Measured configured listing: **7 tools, 10,827 definition bytes**, input schemas 2,631 B, output schemas 5,816 B. This exceeds its historical staticBytes estimate 10,250 but stays below hard 11,500; a stale estimate alone is not the same cap violation as SURF-01. The plan-close and delta specs passed in the focused run. Separate roadmap/timeline writes, real concurrent writers and full acceptance reconciliation remain unverified here.

## Shared validation and limits

**Eight focused spec files / 50 tests passed** across these four plugins. They coexist with new failing-behavior probes; a green suite does not refute cases it never tests. The current settlement run separately passed three files / 14 tests. No tests or product code were added or changed.

`plugin-surfaces.log` records real MCP SDK in-memory listings after real registration. No listed tool was called. Rules may materialize cache in the owned temporary workspace; all owned workspaces are cleaned afterward. The initial measurement harness expected only `registrations.tools`, while these plugins return `tools`; it failed with method-not-found. The preserved initial log describes a harness error, corrected before the successful measurements, not a product defect.

Search/issue repros and roadmap probes retain explicit injected-port boundaries. Root manifests preserve raw evidence hashes. The complete repository audit still requires the remaining production families and test/spec/document/acceptance coverage. No completed-reviewer count, consensus threshold or global audit score is changed.
