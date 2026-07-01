/**
 * init-skill-inventory.ts — f00089 U2 (slice U2, points 2a + 2b).
 *
 * The adoption plan's `A3` section answers two questions:
 *
 *   2a. which of OUR (mcp-vertex) canonical skills should land in the
 *       target so its agents inherit the workflow, and
 *   2b. which skills the target ALREADY ships, so we absorb/inventory
 *       them instead of clobbering them.
 *
 * This module is the inventory side of that. It:
 *
 *   1. scans a small, extensible table of well-known skill conventions in
 *      the TARGET (`skills/`, `.claude/skills/`, `docs/**​/skills/`,
 *      `*.skill.md` files, …) and reports what it found, and
 *   2. exposes the canonical list of OUR skills to migrate as a static,
 *      embedded table (deterministic — the reader is bounded to the
 *      target workspace, so our own skill set cannot be read from disk
 *      here and must not depend on a timestamped manifest).
 *
 * Invariants (AGENTS.md):
 *   - No `process.cwd()`: IO is the injected `IFileReader`, the same
 *     read-only, workspace-bounded reader `analyzeProject`/U1 use.
 *   - Pure data shaping; deterministic given a reader (no timestamps,
 *     no ordering by disk enumeration that the renderer can't sort).
 *   - Advisory only: detection NEVER writes, deletes, or moves a skill.
 */

import type { ICanonicalSkill, ISkillConventionKind, ISkillInventory, ITargetSkill } from '../../contracts/interfaces/init.interface';
import type { IFileReader } from './init-detection.service';

// f00037/f00093: canonical home is contracts/interfaces/init.interface.ts.
// Re-exported here for consumers (adoption-plan builder + specs) that import
// these types from the module that produces them.
export type { ISkillInventory, ITargetSkill } from '../../contracts/interfaces/init.interface';

/**
 * The convention family a detected skill location belongs to. Coarser
 * than the directory itself so the plan can group "all `.claude/skills`
 * style" entries regardless of nesting depth.
 */


/** One of OUR canonical skills to migrate into the target (point 2a). */


/** Full inventory consumed by the A3 renderer. */


/**
 * OUR canonical skills to migrate (point 2a). Embedded statically and
 * kept in id-sorted order so the rendered section is byte-deterministic
 * and never depends on the (timestamped) core manifest at plan time.
 *
 * This mirrors `packages/core/skills/manifest.json`; when a skill is
 * added there, add a row here too (the coverage script keeps the canon
 * honest, this table keeps the PLAN honest).
 */
export const CANONICAL_SKILLS: readonly ICanonicalSkill[] = [
	{ id: 'mcp-vertex-operator', appliesTo: '@mcp-vertex/*' },
	{ id: 'mcp-vertex-plugin-authoring', appliesTo: '@mcp-vertex/*' },
	{ id: 'mcp-vertex-failure-modes', appliesTo: '@mcp-vertex/*' },
	{ id: 'mcp-vertex-token-budget-discipline', appliesTo: '@mcp-vertex/*' },
	{
		id: 'mcp-vertex-token-budget-playbook',
		appliesTo: '@mcp-vertex/*',
	},
	{
		id: 'mcp-vertex-conventional-commits-and-release',
		appliesTo: '@mcp-vertex/*',
	},
	{
		id: 'mcp-vertex-proposals-workflow-playbook',
		appliesTo: '@mcp-vertex/proposals',
	},
	{
		id: 'mcp-vertex-proposal-swarm-runner',
		appliesTo: '@mcp-vertex/proposals',
	},
	{
		id: 'mcp-vertex-multi-agent-coordination',
		appliesTo: '@mcp-vertex/proposals',
	},
	{
		id: 'mcp-vertex-concurrency-patterns',
		appliesTo: '@mcp-vertex/proposals',
	},
	{
		id: 'mcp-vertex-state-repair-playbook',
		appliesTo: '@mcp-vertex/proposals',
	},
	{
		id: 'mcp-vertex-legacy-proposal-migration',
		appliesTo: '@mcp-vertex/proposals',
	},
	{
		id: 'mcp-vertex-status-marker-and-closure',
		appliesTo: '@mcp-vertex/status-marker',
	},
	{ id: 'mcp-vertex-quality-and-rules-gates', appliesTo: '@mcp-vertex/quality' },
	{ id: 'mcp-vertex-rules-solid-architecture', appliesTo: '@mcp-vertex/rules' },
	{ id: 'mcp-vertex-rules-dogma-priority', appliesTo: '@mcp-vertex/rules' },
	{ id: 'mcp-vertex-audit-runner', appliesTo: '@mcp-vertex/audit' },
	{ id: 'mcp-vertex-audit-playbook', appliesTo: '@mcp-vertex/audit' },
];

/**
 * Extensible table of candidate skill DIRECTORIES in the target. Each
 * directory's direct children are treated as individual skills (the
 * common `skills/<name>/SKILL.md` and `.claude/skills/<name>/` shapes).
 * Add a row to extend; nothing else changes.
 */
const SKILL_DIRS: readonly {
	readonly location: string;
	readonly kind: ISkillConventionKind;
}[] = [
	{ location: '.claude/skills', kind: 'claude-skills' },
	{ location: 'skills', kind: 'skills-dir' },
	{ location: 'docs/skills', kind: 'docs-skills' },
	{ location: 'docs/mcp-vertex/skills', kind: 'docs-skills' },
	{ location: '.github/skills', kind: 'skills-dir' },
];

/**
 * Directories scanned (one level deep) for loose `*.skill.md` files —
 * the flat convention some projects use instead of a skill-per-dir.
 */
const SKILL_FILE_DIRS: readonly string[] = ['skills', 'docs', '.claude'];

const SKILL_FILE_RE = /^(.+)\.skill\.md$/i;

/** A skill dir's own non-skill bookkeeping entries are ignored. */
const isIgnoredSkillEntry = (name: string): boolean => {
	const lower = name.toLowerCase();
	return (
		lower === 'readme.md' ||
		lower === 'manifest.json' ||
		lower === 'index.md' ||
		lower === '.gitkeep' ||
		lower.startsWith('.')
	);
};

/** Scan the per-directory skill conventions (skill-per-subdir). */
const scanSkillDirs = async (
	reader: IFileReader,
): Promise<ITargetSkill[]> => {
	const out: ITargetSkill[] = [];
	for (const dir of SKILL_DIRS) {
		const entries = await reader.listDir(dir.location);
		for (const name of entries) {
			if (isIgnoredSkillEntry(name)) continue;
			// A `*.skill.md` file directly under a skills dir is reported
			// by the file scanner; here we only register sub-skills.
			if (SKILL_FILE_RE.test(name)) continue;
			out.push({
				kind: dir.kind,
				location: `${dir.location}/${name}`,
				name,
			});
		}
	}
	return out;
};

/** Scan for loose `*.skill.md` files one level under known roots. */
const scanSkillFiles = async (
	reader: IFileReader,
): Promise<ITargetSkill[]> => {
	const out: ITargetSkill[] = [];
	for (const dir of SKILL_FILE_DIRS) {
		const entries = await reader.listDir(dir);
		for (const name of entries) {
			const m = name.match(SKILL_FILE_RE);
			if (m === null) continue;
			out.push({
				kind: 'skill-file',
				location: `${dir}/${name}`,
				name: m[1] as string,
			});
		}
	}
	return out;
};

/** Stable sort so the rendered A3 section is byte-deterministic. */
const byLocation = (a: ITargetSkill, b: ITargetSkill): number =>
	a.location < b.location ? -1 : a.location > b.location ? 1 : 0;

/**
 * Build the skill inventory for the target.
 *
 * `reader` is injected (DIP); the caller wires it to the target
 * workspace. Detection is read-only and advisory — the plan describes
 * the migration; `init` never writes a skill into the target here.
 */
export const detectSkillInventory = async (
	reader: IFileReader,
): Promise<ISkillInventory> => {
	const dirSkills = await scanSkillDirs(reader);
	const fileSkills = await scanSkillFiles(reader);
	// De-dup by location (a `*.skill.md` under `skills/` could be caught
	// by both scanners depending on the candidate tables).
	const seen = new Set<string>();
	const targetSkills: ITargetSkill[] = [];
	for (const s of [...dirSkills, ...fileSkills]) {
		if (seen.has(s.location)) continue;
		seen.add(s.location);
		targetSkills.push(s);
	}
	targetSkills.sort(byLocation);
	return {
		targetSkills,
		canonicalSkills: CANONICAL_SKILLS,
		targetHasSkills: targetSkills.length > 0,
	};
};
