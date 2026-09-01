/**
 * doctor/types.ts — shared types for the `mcpv doctor` health checks
 * (f00191 / q00006 Track I).
 *
 * `doctor` is a sectioned health report. Each section is one health
 * dimension (env, config, manifests, plugins, runtime, stale-docs,
 * permissions, …) with a worst-status-wins rollup and findings.
 *
 * `IDoctorCheckContext` is the minimum surface every pure check needs:
 * a workspace root and injectable filesystem primitives so the checks
 * are testable without a real workspace.
 *
 * Server-dependent checks (`plugins`, `tools`) bypass this surface and
 * call `mcp-vertex_overview` directly via the `request` helper the
 * runner passes into the command; they live in the command group file
 * itself, not here.
 */
import type {
	DoctorSectionStatus,
	IDoctorSection,
} from './analyze-config-roots.service';

export type { DoctorSectionStatus, IDoctorSection };

/**
 * Filesystem primitives a pure doctor check needs. All paths are
 * workspace-relative (the check joins them to `workspace`). `fileExists`
 * returning `false` is the same as `readFile` returning `undefined`.
 */
export interface IDoctorFs {
	readonly fileExists: (relPath: string) => Promise<boolean>;
	readonly readFile: (relPath: string) => Promise<string | undefined>;
	readonly listDirs: (relPath: string) => Promise<readonly string[]>;
}

/**
 * Per-invocation context for a pure doctor check. `cwd` is the resolved
 * workspace root the doctor was run against; `now` is injected for
 * tests that need a deterministic timestamp (e.g. drift age reports).
 */
export interface IDoctorCheckContext {
	readonly workspace: string;
	readonly fs: IDoctorFs;
	readonly now: () => Date;
}

/** A pure health check — produces one section, never throws. */
export type DoctorCheck = (ctx: IDoctorCheckContext) => Promise<IDoctorSection>;

/** Identifier used by the doctor runner to bucket sections. */
export type DoctorCheckId =
	| 'env'
	| 'config'
	| 'manifests'
	| 'runtime'
	| 'git-status'
	| 'stale-docs'
	| 'permissions'
	| 'plugins'
	| 'tools';

/**
 * One entry in the P0/P1/P2 priority bucket list. Mirrors the section
 * status but is the displayable slice — the score combines both.
 */
export interface IDoctorFinding {
	readonly checkId: DoctorCheckId;
	readonly message: string;
}
