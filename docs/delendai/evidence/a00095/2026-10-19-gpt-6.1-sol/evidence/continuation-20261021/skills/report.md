# Owner skills alignment review

Snapshot: `26b442f8fa1e73e9583be5044b5ca557b59c8919`. Reviewer: gpt-6.1-sol / Codex. Date: 2026-10-21.

All **28 authored owner SKILL.md files (2,973 lines)** were actually read in full: eight core and twenty plugin bodies. No bodies are excluded as generated and no body reading remains pending. This card evaluates skill/catalog/path/instruction alignment; it does not replace engine audits or claim runtime acceptance. Score: **5.7/10** for this narrow alignment surface.

The skills contain useful compact workflows and real tool references, but the canonical proposal recipe has incorrect names/keys and omits default peer-review prerequisites, isolation instructions predate unit worktrees, and release/extension guidance describes older contracts. Six new scoped findings are recorded below, after comparison with the own 90-entry index.

## Source and validation

- Fixed snapshot only, retrieved with git show; all retained source bytes verified against the Git object in source-hashes.json. No checkout, claim, branch, config, repository or product write.
- Current agent-catalog.generated.json (257 tools/27 skills) is cross-checked with managed-lazy catalog (55 plugin records), source registrations and the composed manifest. These are source inventories, not a running-host tools/list. Generated catalogs are mechanically parsed; they receive no full-reading credit.
- Three own pure probes executed successfully: the unmodified production manifest checker detects exactly one missing owner entry; unmodified packageSkillSource lists/loads that skill. The real pure identity resolver also resolves correct hidden capabilities and their bare registered id while rejecting only the incorrect recipe qualified name against a synthetic catalog port. No plugin entrypoint or provider starts.
- Static source comparison establishes wrong input keys/name without executing any proposal tool. Relative Markdown targets are resolved against the fixed Git tree, with illustrative/forbidden historical paths manually filtered.
- Full lint/test/build/validate, real MCP host behavior, browser behavior, network/providers and release commands were not executed. Explicit remaining validation lives in pending.json; source-reading completion is separate.

## New findings

| ID | Priority | Finding |
|---|---|---|
| SKILL-01 | P2 | Canonical skill examples disagree with registered tool names, arguments and review prerequisites |
| SKILL-02 | P2 | Coordination skills prescribe obsolete per-agent worktrees instead of the current development profile |
| SKILL-03 | P3 | Storm-repair skill is missing from the composed versioned manifest |
| SKILL-04 | P3 | Actionable skill links and source pointers no longer resolve |
| SKILL-05 | P3 | Rules architecture skill says barrel-only extension wires a language, but the factory has an explicit adapter list |
| SKILL-06 | P3 | Release skill still describes ten packages and release-on-main while current automation is opt-in |

Each finding has 15 populated fields, exact real excerpts, source locations, a suggested correction and explicit limits in findings.json. No product fix was applied.

## Counterevidence and deduplication

The generated agent JSON omits observability from this tool surface, but its managed catalog and registration contain obs_errors. The incident-response skill is therefore not reported as naming a nonexistent tool. A missing storm skill in the manifest is also not proof of runtime nondiscovery: the portable source discovers it and assembly merges supplemental entries. The finding is limited to versioned metadata/checker drift.

Existing EXT-02/EXT-04 already include the external skill pin/redaction promises; CP-11 covers storm auto-filing without a production proposal store; PROP-PLAN02 covers dropped parsed plan children; PROP-GC02 covers ignored merged-worktree idle floor. None is added again. No external provider or private logs were consulted.

## Per-file opinion

| Source body | Exact reading | Static opinion | Related evidence |
|---|---|---|---|
| `packages/core/skills/conventional-commits-and-release/SKILL.md` | 1–112 | Release command remains real; fixed ten-package order, old CI trigger and source path have drifted. | SKILL-04, SKILL-06 |
| `packages/core/skills/delendai-token-budget-playbook/SKILL.md` | 1–77 | Compact-first discipline is useful; consolidate scope parameter does not exist in current input schema. | SKILL-01 |
| `packages/core/skills/error-collection/SKILL.md` | 1–124 | No tool-name or concrete-path mismatch identified. Redaction and auto-report behavior were not re-executed in this alignment review. | No new mismatch confirmed; runtime not exercised |
| `packages/core/skills/failure-modes/SKILL.md` | 1–47 | Recovery names match local tool ids. Statements that corrupt storage continues empty are not a guarantee of lossless repair; related existing C5 is not reopened. | No new mismatch confirmed; runtime not exercised |
| `packages/core/skills/operator/SKILL.md` | 1–94 | Preset membership table is historical and omits newer presets/plugins; minimal entry still agrees. Live preset catalog should take precedence. | SKILL-06 |
| `packages/core/skills/plugin-authoring/SKILL.md` | 1–83 | Referenced literal repo paths exist. Language-adapter guidance explicitly includes factory wiring, unlike rules-solid skill. Handler invariants are normative, not proven globally here. | No new mismatch confirmed; runtime not exercised |
| `packages/core/skills/tabs-component/SKILL.md` | 1–169 | Tabs and logo source paths exist; current Astro wrapper delegates rendering to shared component. No browser or no-JS behavior executed. | No new mismatch confirmed; runtime not exercised |
| `packages/core/skills/token-budget-discipline/SKILL.md` | 1–10 | Compatibility pointer exists and is catalogued, but its sole relative target is missing. | SKILL-04 |
| `plugins/audit/skills/audit-runner/SKILL.md` | 1–47 | Tool local ids audit_plan/audit_consolidate exist; lifecycle examples are intentionally older surface guidance. No audit run or consolidation executed. | No new mismatch confirmed; runtime not exercised |
| `plugins/audit/skills/delendai-audit-playbook/SKILL.md` | 1–267 | Methodology fully read; selected old source/history paths require update. Heuristic checks (LOC/spec counts) are prompts for review, not proof of defects. | SKILL-04 |
| `plugins/commit-policy/skills/read-stderr-storm/SKILL.md` | 1–155 | Body exists outside composed manifest. Portable source lists/loads it, so not asserted globally undiscoverable. Boot auto-filing promise duplicates CP-11. | SKILL-03 |
| `plugins/external-mcps/skills/external-mcps/SKILL.md` | 1–77 | All eight local tools exist. Skill promises executable pin and redaction before durable writes; source audit already covers these exact promises, not new findings. | EXT-02, EXT-04 |
| `plugins/proposals/skills/concurrency-patterns/SKILL.md` | 1–84 | Legacy boolean/agent branch instruction omits current unit-worktree policy. Mutex explanation is conceptual; liveness was not retested. | SKILL-02 |
| `plugins/proposals/skills/legacy-proposal-migration/SKILL.md` | 1–121 | Three migration scripts exist. Old index.json references are explicitly historical/forbidden, not missing deliverable defects. No migration applied. | No new mismatch confirmed; runtime not exercised |
| `plugins/proposals/skills/multi-agent-coordination/SKILL.md` | 1–316 | Old isolation and force-transition closure advice conflicts with current work model/review flow; bootstrap link is broken. GC age promise already belongs to PROP-GC02. | SKILL-02, SKILL-04 |
| `plugins/proposals/skills/proposal-swarm-runner/SKILL.md` | 1–10 | Ten-line compatibility pointer resolves to the real canonical workflow skill. It contains no longer background despite reverse wording in canonical skill. | No new mismatch confirmed; runtime not exercised |
| `plugins/proposals/skills/proposals-workflow-playbook/SKILL.md` | 1–157 | Canonical examples contain wrong id/planId keys, wrong close-plan name and omit required peer submission. Plan parser promise additionally relates to existing PROP-PLAN02, not a new parser finding. | SKILL-01, SKILL-02 |
| `plugins/proposals/skills/state-repair-playbook/SKILL.md` | 1–74 | state_health/state_repair ids, modes and dry-run default match source. Heartbeat-staleness discussion is simplified and not independently executed here. | No new mismatch confirmed; runtime not exercised |
| `plugins/quality/skills/quality-and-rules-gates/SKILL.md` | 1–104 | Quality source paths moved under services; rules/quality local ids exist. Actual scope/command-policy execution not run. | SKILL-04 |
| `plugins/rules/skills/delendai-rules-dogma-priority/SKILL.md` | 1–197 | Policy seam paths resolve against owner root and contract file exists. Example apps/web/eslint.config.mjs is a hypothetical project example, not treated as a broken repo link. | No new mismatch confirmed; runtime not exercised |
| `plugins/rules/skills/rules-solid-architecture/SKILL.md` | 1–138 | Historical proposal link moved to legacy/closed. Five-file recipe invents languages/index.ts and omits concrete default adapter wiring. | SKILL-04, SKILL-05 |
| `plugins/skills-pack/skills/debugging-playbook/SKILL.md` | 1–70 | All eight tools in frontmatter match current catalog. No repairs, claims or diagnostic tools invoked. | No new mismatch confirmed; runtime not exercised |
| `plugins/skills-pack/skills/incident-response/SKILL.md` | 1–61 | obs_errors absent from generated agent JSON but present in managed catalog and concrete registration: counterexample to treating one generated surface as exhaustive. No remote source queried. | No new mismatch confirmed; runtime not exercised |
| `plugins/skills-pack/skills/migrate-from-x/SKILL.md` | 1–62 | Declared tools and legacy-migration body path match current source. No codemod/migration executed. | No new mismatch confirmed; runtime not exercised |
| `plugins/skills-pack/skills/performance-optimization/SKILL.md` | 1–62 | Six declared tools match current source catalog. No profiling, benchmark or quality gates executed. | No new mismatch confirmed; runtime not exercised |
| `plugins/skills-pack/skills/pr-review-checklist/SKILL.md` | 1–63 | Six declared tools match catalog; release-only verify:tools is correctly distinguished from a tool reference. No forge/network action. | No new mismatch confirmed; runtime not exercised |
| `plugins/skills-pack/skills/security-hardening-checklist/SKILL.md` | 1–60 | Five declared tools match source catalog. This is a legitimate task-specific checklist; its existence does not classify the joint audit as a security task. | No new mismatch confirmed; runtime not exercised |
| `plugins/status-marker/skills/status-marker-and-closure/SKILL.md` | 1–132 | Local close/validate ids exist; namespace examples are placeholders and should be resolved at runtime. No marker tool invoked, no protocol compliance test run. | No new mismatch confirmed; runtime not exercised |

## Score rationale

| Dimension of this instruction surface | 0–10 | Rationale |
|---|---:|---|
| Tool/input consistency | 5 | Canonical workflow has copyable invalid examples. |
| Path/link integrity | 5 | Three broken links and moved source pointers. |
| Workflow/current-policy fit | 4 | Unit isolation and peer-review process missing from old recipes. |
| Versioned metadata completeness | 6 | One missing manifest body; portable discovery limits the impact. |
| Architecture contributor guidance | 6 | Useful seams, but new-language registration recipe disagrees with factory. |
| Token discipline | 7 | Compact/pointer design is good; an unsupported scope example remains. |
| Privacy/scope discipline | 7 | Guidance expresses useful boundaries; external promises linked to prior defects rather than assumed true. |
| Maintainability | 5 | Frozen tables duplicate current source inventories. |
| Verification/evidence | 6 | Useful production checker but it catches an existing omitted entry; no blanket operational validation here. |

The unweighted mean is 5.7. Scores describe reviewed instructional alignment only, not whole-product readiness.

## Durable artifacts

coverage.json records each full body read, SHA256, exact range, opinion and limits. support-coverage.json separates source ranges from parsed metadata. findings.json, reference-census.json, path-reference-census.json, static-check-result.json and dedup.json retain the reasoning boundaries. probe.ts / probe-result.jsonl / probe-stderr.log retain the three executed cases. finalize.py regenerates the report from retained exact-source artifacts and checks their object hashes.
