/**
 * init.interface.ts — f00037 contract surface for the `init` /
 * `init:default` workflow (f00084, f00088, f00089, f00103).
 *
 * Every structural type used by the `lib/init/*.service.ts` family
 * lives here so:
 *
 *   1. The service modules stay implementation-only — they import the
 *      types they need and never re-declare them.
 *   2. External hosts and tests can `import type` a stable surface
 *      without dragging any of the IO / catalog / detection logic
 *      into their own bundles.
 *   3. SRP: this file owns the *shape* of init; the .service.ts files
 *      own the *behaviour*.
 *
 * Grouped by concern (ISP):
 *
 *   - Flags the operator can pass (`IInitFlags`).
 *   - The `IInitDetection` projection populated by `withDetection`.
 *   - Render / write contracts (`IRenderedFile`, `IRenderedBundle`,
 *     `IInitWrittenFile`, `IInitHumanInput`, `IInitWrite`,
 *     `IMcpJsonWriteResult`).
 *   - Foreign-detect inventory (`IForeignIdScheme`,
 *     `IForeignConventionKind`, `IForeignConvention`,
 *     `IForeignProposalInventory`).
 *   - Adoption plan (`IAdoptionPlan`, `IAdoptionSections`,
 *     `IToolNamespace`, `IToolUnification`).
 *   - Skill inventory (`ISkillConventionKind`, `ITargetSkill`,
 *     `ICanonicalSkill`, `ISkillInventory`).
 *   - Host-instructions consolidation
 *     (`IHostInstructionsTarget`, `IAgentInstructionSourceSpec`,
 *     `IDiscoveredInstructionSource`, `IConsolidationWrite`,
 *     `IConsolidationPlan`).
 */
import type { IProjectAnalysis } from '@mcp-vertex/core/public';

// ----------------------------------------------------------------
// Operator-facing flags
// ----------------------------------------------------------------

/** Flags shared by `init` and `init:default`. */
export interface IInitFlags {
	readonly dryRun: boolean;
	readonly force: boolean;
	readonly mcpVertexRoot?: string;
	readonly pluginPathsRoot?: string;
}

// ----------------------------------------------------------------
// Detection projection (f00088 S1)
// ----------------------------------------------------------------

/** Source-root kinds the rest of init branches on. */
export type ISourceRoot = 'libs' | 'packages' | 'plugins' | 'src';

/**
 * Compact detection summary the rest of `init` consumes. Every field
 * is populated for every project shape — `unknown`/`undefined` mean
 * the detector did not find a signal, never that the project lacks the
 * thing.
 */
export interface IInitDetection {
	readonly language: IProjectAnalysis['language'];
	readonly framework: string | undefined;
	readonly packageManager: IProjectAnalysis['packageManager'];
	readonly monorepoTool: string | undefined;
	readonly hasMcpProject: IProjectAnalysis['hasMcpProject'];
	readonly mcpEvidence: readonly string[];
	/**
	 * Where the operator's plugin skeletons should land.
	 * Derived from the table in the proposal (Angular/Nx → `libs`,
	 * yarn/pnpm/bun workspaces with `packages/*` → `packages`, …).
	 */
	readonly pluginPathsRoot: string;
	/** Source-root kind the operator's project uses. */
	readonly sourceRoot: ISourceRoot;
	/**
	 * Resolved path to the mcp-vertex host-server entry script.
	 * Populated by `resolveHostEntryPath` in S2; `undefined` here so
	 * S1 stays decoupled from disk-side resolution.
	 */
	readonly hostEntryPath: string | undefined;
	/** Which resolution branch S2 picked (debug aid; surfaced in `--json`). */
	readonly hostEntrySource:
		| 'flag'
		| 'node_modules'
		| 'sibling'
		| 'npm_dist'
		| 'unresolved';
}

// ----------------------------------------------------------------
// Render + write contracts
// ----------------------------------------------------------------

/** A single file produced by `renderInitBundle`. */
export interface IRenderedFile {
	/** Workspace-relative path. */
	readonly relPath: string;
	/** File contents as rendered (post-template, pre-write). */
	readonly content: string;
}

/** The complete rendered bundle (config + host instructions + agents + …). */
export interface IRenderedBundle {
	readonly files: readonly IRenderedFile[];
	readonly summary: string;
}

/** One file as actually written to disk, with the resolved path. */
export interface IInitWrittenFile {
	readonly path: string;
	readonly kind: 'written' | 'exists' | 'skipped' | 'merged';
	/**
	 * When `kind === 'merged'`, the names of the other MCP servers
	 * the merge preserved in `.vscode/mcp.json`. The recap renders
	 * these next to the merge stamp so the operator can confirm at
	 * a glance that the merge did not silently drop a tool wiring.
	 */
	readonly preserved?: readonly string[];
}

/** The input the human-summary renderer consumes. */
export interface IInitHumanInput {
	readonly answers: import('../../lib/init/init-answers.types').IInitAnswers;
	readonly written: readonly IInitWrittenFile[];
	readonly dryRun: boolean;
	/** When `true`, force colour output regardless of TTY.
	 * When `false`, force plain text.
	 * When `undefined`, defer to the shared palette (TTY-aware +
	 * respects `NO_COLOR` / `FORCE_COLOR`). */
	readonly enabled?: boolean;
}

/** One `writeWorkspaceText` call described declaratively. */
export interface IInitWrite {
	readonly path: string;
	readonly content: string;
}

/**
 * Outcome of writing the MCP server entry into `.vscode/mcp.json`.
 *
 * Four terminal states:
 *
 *   - `written` — fresh install, the canonical `mcp-vertex`
 *     bundle landed on disk.
 *   - `merged`  — existing `.vscode/mcp.json` was updated via
 *     merge; every other server entry the operator had wired
 *     (`filesystem`, `github`, `docker`, …) is preserved and
 *     `preserved` lists their names so the recap can surface
 *     them. The runner / recap distinguishes this from a
 *     `written` to make the upsert visible.
 *   - `exists`  — the file existed but was left untouched
 *     because its content is not parseable as a JSON object;
 *     the operator must hand-edit before `init` will touch it
 *     again.
 *   - `skipped` — the operator passed a host-instructions mode
 *     of `skip` or otherwise opted out; nothing was written.
 */
export type IMcpJsonWriteResult =
	| { kind: 'written'; path: string }
	| { kind: 'exists'; path: string }
	| { kind: 'skipped'; path: string }
	| { kind: 'merged'; path: string; preserved: readonly string[] };

// ----------------------------------------------------------------
// Foreign-detect inventory (f00089 U1)
// ----------------------------------------------------------------

/**
 * Canonical id-numbering schemes a foreign proposal system can use.
 *   - `mcp-vertex`  — our own `f00001` / `p00012` padded prefix shape.
 *   - `rfc`         — `RFC-0001`, `rfc-12`, `0001-title` (rfc-style).
 *   - `adr`         — `0001-record-title.md` (ADR / MADR numbering).
 *   - `numeric`     — bare leading number with no recognised prefix.
 *   - `none`        — markdown present but no numbering signal found.
 */
export type IForeignIdScheme =
	| 'mcp-vertex'
	| 'rfc'
	| 'adr'
	| 'numeric'
	| 'none';

/**
 * The shape/convention family a detected directory belongs to. This is
 * coarser than the id-scheme: a `docs/proposals/` folder is still the
 * `proposals` family even if it happens to number its files ADR-style.
 */
export type IForeignConventionKind =
	| 'proposals'
	| 'rfcs'
	| 'adr'
	| 'plans'
	| 'specs'
	| 'changeset';

/** One detected foreign proposal/plan location. */
export interface IForeignConvention {
	/** Convention family (proposals / rfcs / adr / …). */
	readonly kind: IForeignConventionKind;
	/** Workspace-relative directory where it was found. */
	readonly location: string;
	/** Inferred id/numbering scheme of the entries inside `location`. */
	readonly idScheme: IForeignIdScheme;
	/** Count of markdown documents that look like records/proposals. */
	readonly documentCount: number;
	/**
	 * Highest numeric id observed across the entries (decimal), or 0
	 * when no numbered entry was found. Used to allocate the next free
	 * id without re-listing the directory.
	 */
	readonly maxNumericId: number;
	/** A few example filenames (capped) for human-readable plan output. */
	readonly sampleFiles: readonly string[];
}

/** Full inventory of every foreign proposal/plan convention found. */
export interface IForeignProposalInventory {
	/** True when at least one convention directory was found. */
	readonly found: boolean;
	/** Every detected convention, in detection order (first = primary). */
	readonly conventions: readonly IForeignConvention[];
	/**
	 * The convention the migration plan should treat as the primary
	 * source to migrate (the first non-empty one), or `undefined`.
	 */
	readonly primary: IForeignConvention | undefined;
}

// ----------------------------------------------------------------
// Adoption plan (f00089 U2)
// ----------------------------------------------------------------

/** One tool namespace owned by a side of the unification (ours/theirs). */
export interface IToolNamespace {
	/** `ours` (mcp-vertex) or `theirs` (the target's own MCP tools). */
	readonly origin: 'ours' | 'theirs';
	/** The plugin/server id contributing the namespace. */
	readonly plugin: string;
	/**
	 * The resolved tool-name prefix for the namespace, e.g.
	 * `mcp-vertex_proposals` — every tool of the plugin is
	 * `<namespace>_<tool>` at runtime.
	 */
	readonly namespace: string;
}

/** The collision-free unification map (point 2c). */
export interface IToolUnification {
	/** Our resolved plugin namespaces (prefix-per-plugin). */
	readonly ours: readonly IToolNamespace[];
	/** The target's own MCP tool namespaces, where detectable. */
	readonly theirs: readonly IToolNamespace[];
	/**
	 * Namespaces that collide across the two sides (same string). Empty
	 * under the prefix-per-plugin contract; surfaced so the plan can
	 * assert the map is collision-free and flag the rare case where the
	 * target also uses the literal `mcp-vertex` prefix.
	 */
	readonly collisions: readonly string[];
}

/** Sections an adoption plan can render (U2 A1..A4). */
export interface IAdoptionSections {
	/** Rendered `### A3 — skill migration` section (replaces the placeholder). */
	readonly skillSection: string;
	/** Rendered `### A4 — tool-namespace unification` section. */
	readonly toolSection: string;
	/** The skill inventory the A3 section was built from (surfaced for `--json`). */
	readonly skillInventory: ISkillInventory;
	/** The tool-unification map the A4 section was built from. */
	readonly toolUnification: IToolUnification;
}

/** The full adoption plan as the migration offer renders it. */
export interface IAdoptionPlan {
	readonly relPath: string;
	readonly content: string;
	/** The allocated id (`f00001`, `f00042`, …) — surfaced for `--json`. */
	readonly id: string;
	/** The foreign proposal inventory the plan was built from (U1). */
	readonly inventory: IForeignProposalInventory;
	/**
	 * The U2 (A3 + A4) sections embedded in the plan: the skill inventory
	 * and the tool-unification map, surfaced for `--json` without
	 * re-parsing the markdown.
	 */
	readonly sections: IAdoptionSections;
}

// ----------------------------------------------------------------
// Skill inventory (f00089 U2 2a + 2b)
// ----------------------------------------------------------------

/**
 * The convention family a detected skill location belongs to. Coarser
 * than the directory itself so the plan can group "all `.claude/skills`
 * style" entries regardless of nesting depth.
 */
export type ISkillConventionKind =
	| 'skills-dir' // a top-level or nested `skills/` directory
	| 'claude-skills' // `.claude/skills/` (Claude Code convention)
	| 'docs-skills' // `docs/**/skills/` documentation skills
	| 'skill-file'; // loose `*.skill.md` files anywhere scanned

/** One detected skill in the TARGET project. */
export interface ITargetSkill {
	/** Convention family the skill was found under. */
	readonly kind: ISkillConventionKind;
	/** Workspace-relative path to the skill (dir or file). */
	readonly location: string;
	/**
	 * A human-readable identifier for the skill: the skill directory
	 * name, or the `*.skill.md` basename without the suffix.
	 */
	readonly name: string;
}

/** One OUR (mcp-vertex) canonical skill slated to land in the target. */
export interface ICanonicalSkill {
	/** Canonical skill id (matches `packages/core/skills/manifest.json`). */
	readonly id: string;
	/** The plugin/scope the skill applies to (for the plan's prose). */
	readonly appliesTo: string;
}

/** The full skill inventory the plan renders. */
export interface ISkillInventory {
	/** Skills already present in the target (absorb, never clobber). */
	readonly targetSkills: readonly ITargetSkill[];
	/** Our canonical skills the plan offers to migrate into the target. */
	readonly canonicalSkills: readonly ICanonicalSkill[];
	/** True when the target already ships at least one skill. */
	readonly targetHasSkills: boolean;
}

// ----------------------------------------------------------------
// Host-instructions consolidation
// ----------------------------------------------------------------

/** One host-instructions target the consolidation writer handles. */
export interface IHostInstructionsTarget {
	readonly relPath: string;
	readonly body: string;
}

/** One agent-instruction source spec the writer probes. */
export interface IAgentInstructionSourceSpec {
	readonly label: string;
	readonly kind: 'file' | 'basename' | 'extension';
	readonly match: string;
}

/** One discovered scattered agent-instruction source in the target. */
export interface IDiscoveredInstructionSource {
	readonly relPath: string;
	readonly label: string;
	/** Raw on-disk content of the source (verbatim, never mutated). */
	readonly content: string;
	/**
	 * `true` when the file's body — outside of any mcp-vertex block — is
	 * empty, i.e. it is already nothing but a pointer we wrote earlier. Such
	 * a file carries no original prose to collapse and is skipped by the
	 * canonical merge (idempotency).
	 */
	readonly isPointerOnly: boolean;
}

/** One write the consolidation plan executes. */
export interface IConsolidationWrite {
	readonly relPath: string;
	readonly content: string;
	/** `canonical` (the sink doc) or `pointer` (a legacy location). */
	readonly role: 'canonical' | 'pointer';
}

/** The complete plan for consolidating host instructions. */
export interface IConsolidationPlan {
	readonly sources: readonly IDiscoveredInstructionSource[];
	readonly canonicalRel: string;
	readonly writes: readonly IConsolidationWrite[];
}
