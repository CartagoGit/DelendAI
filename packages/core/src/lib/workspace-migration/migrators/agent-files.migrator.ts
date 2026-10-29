/**
 * agent-files.migrator.ts — b00239 S4.
 *
 * Rewrites the per-host agent markdown files (`.github/agents/*`,
 * `.claude/agents/*`, `.codex/agents/*`) so the legacy identity is
 * gone from both the YAML frontmatter and the prose body.
 *
 * ## Scope, narrow on purpose
 *
 * Owns ONE shape: a markdown file with a YAML frontmatter block,
 * optional body, where the relevant fields are `name`, `description`
 * and `model` (the three fields Copilot / Claude Code / Codex all
 * recognise). Any other frontmatter key passes through untouched,
 * which is what keeps the migrator safe for files that carry
 * project-specific metadata we do not understand.
 *
 * ## Why a hand-rolled YAML parser, not `js-yaml`
 *
 * `js-yaml` is not a direct dependency of `@delendai/core`, and
 * adding it for one migrator would mean editing `package.json`
 * outside the slice target list. The frontmatter we care about is a
 * very narrow subset of YAML — `key: value`, optional quotes,
 * booleans, numbers, inline arrays — and a parser that handles
 * exactly that subset is shorter than a generic YAML parser and
 * impossible to misuse on a richer document. Anything outside the
 * subset is preserved as a string under a `__unparsed` key, so the
 * file still round-trips byte-identical.
 *
 * ## Why walk the prose body, not just the frontmatter
 *
 * A migrating agent file might still say "this file routes
 * `delendai_*` tools" in its prose even after the frontmatter is
 * updated. The acceptance criterion is "no live reference to the
 * legacy identity"; leaving the prose half-rewritten would be the
 * exact failure the S8 residual scanner is meant to catch. So the
 * prose body is rewritten with the same identity table, and a
 * second apply over the same file is a no-op.
 */
import { access, readFile, rename } from 'node:fs/promises';
import { readdir, stat } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';

import type { IFrontmatterShape } from '../../contracts/interfaces/agent-frontmatter.interface';
import { writeFileAtomic } from '../../shared/atomic-write';
import {
	parseFrontmatter,
	serialiseFrontmatter,
	splitMarkdown,
} from './agent-frontmatter';

import type {
	IMigration,
	IMigrationPlanStep,
} from '../../contracts/interfaces/workspace-migration.interface';

import {
	rewriteIdentityInString,
	stringHasLegacyIdentity,
} from './identity-renames';

/** Stable id recorded in the journal. NOT a number, by design. */
export const AGENT_FILES_MIGRATOR_ID = 'agentFilesMigrator:v1';

/** The host-relative directories that hold agent markdown files. */
const AGENT_DIRECTORIES = [
	'.github/agents',
	'.claude/agents',
	'.codex/agents',
] as const;

/**
 * The instruction files a host reads at the root of the project, outside
 * any agent folder. They kept the old name after a migration that walked
 * only the folders.
 */
const ROOT_INSTRUCTION_FILES = [
	'AGENTS.md',
	'CLAUDE.md',
	'.github/copilot-instructions.md',
] as const;

/** Frontmatter fields the migrator walks. Other keys pass through. */
const AGENT_FRONTMATTER_FIELDS = ['name', 'description', 'model'] as const;

const pathExists = async (absolutePath: string): Promise<boolean> =>
	access(absolutePath).then(
		() => true,
		() => false,
	);

/**
 * Find every markdown file under one of the agent directories.
 * Returns absolute paths. A shallow walk is enough: the three
 * directories the migrator knows about do not contain nested
 * agent definitions.
 */
const listAgentFiles = async (
	workspaceRoot: string,
): Promise<readonly string[]> => {
	const results: string[] = [];
	for (const relDir of AGENT_DIRECTORIES) {
		const absoluteDir = join(workspaceRoot, relDir);
		if (!(await pathExists(absoluteDir))) continue;
		try {
			const statResult = await stat(absoluteDir);
			if (!statResult.isDirectory()) continue;
		} catch {
			continue;
		}
		let entries: import('node:fs').Dirent[];
		try {
			entries = await readdir(absoluteDir, { withFileTypes: true });
		} catch {
			continue;
		}
		for (const entry of entries) {
			if (!entry.isFile()) continue;
			if (!entry.name.endsWith('.md')) continue;
			results.push(join(absoluteDir, entry.name));
		}
	}
	for (const relFile of ROOT_INSTRUCTION_FILES) {
		const absoluteFile = join(workspaceRoot, relFile);
		if (await pathExists(absoluteFile)) results.push(absoluteFile);
	}
	return results;
};

/**
 * Rewrite one agent file's content. Returns the new content when
 * anything changed; `null` when the file is already migrated
 * (idempotent re-run).
 */
const rewriteAgentFile = async (
	absolutePath: string,
): Promise<string | null> => {
	const original = await readFile(absolutePath, 'utf8');
	const split = splitMarkdown(original);
	let next = original;
	let touched = false;

	if (split.kind === 'with-frontmatter') {
		const parsed = parseFrontmatter(split.frontmatter);
		let fmChanged = false;
		const rewrittenFm: IFrontmatterShape = { ...parsed };
		for (const field of AGENT_FRONTMATTER_FIELDS) {
			const value = parsed[field];
			if (typeof value !== 'string') continue;
			const replaced = rewriteIdentityInString(value);
			if (replaced !== value) {
				rewrittenFm[field] = replaced;
				fmChanged = true;
			}
		}
		// Walk every string-typed frontmatter value for any
		// legacy token the user might have placed there.
		for (const [key, value] of Object.entries(parsed)) {
			if (key.startsWith('__raw_')) continue;
			if (typeof value !== 'string') continue;
			if (!stringHasLegacyIdentity(value)) continue;
			const replaced = rewriteIdentityInString(value);
			if (replaced !== value) {
				rewrittenFm[key] = replaced;
				fmChanged = true;
			}
		}
		const rewrittenBody = stringHasLegacyIdentity(split.body)
			? rewriteIdentityInString(split.body)
			: split.body;
		if (rewrittenBody !== split.body) {
			touched = true;
		}
		if (fmChanged) {
			touched = true;
			next = `${serialiseFrontmatter(rewrittenFm)}${rewrittenBody}`;
		} else if (touched) {
			next = `${serialiseFrontmatter(parsed)}${rewrittenBody}`;
		}
	} else if (stringHasLegacyIdentity(split.body)) {
		touched = true;
		next = rewriteIdentityInString(split.body);
	}

	if (!touched) return null;
	if (next === original) return null;
	return next;
};

/**
 * Where an agent file whose name carries the old identity belongs: its
 * name rewritten like its `name:` header is. `undefined` when the name
 * is already right. Rewriting the content alone left
 * `<old>-orchestrator.md` declaring `name: delendai-orchestrator`.
 */
const renamedPath = (file: string): string | undefined => {
	const name = basename(file);
	const next = rewriteIdentityInString(name);
	return next === name ? undefined : join(dirname(file), next);
};

/**
 * Factory: a fresh migrator instance. Pure at import time,
 * side-effect free until `apply` is called.
 */
export const createAgentFilesMigrator = (): IMigration => {
	return {
		id: AGENT_FILES_MIGRATOR_ID,

		detect: async (ctx) => {
			const files = await listAgentFiles(ctx.workspaceRoot);
			if (files.length === 0) return false;
			// A cheap probe: the directory exists, so something
			// might need rewriting. We do NOT read every file —
			// that would be a tax on the happy path. The actual
			// read happens in `apply`.
			return true;
		},

		plan: async (ctx): Promise<readonly IMigrationPlanStep[]> => {
			const files = await listAgentFiles(ctx.workspaceRoot);
			if (files.length === 0) return [];
			const steps: IMigrationPlanStep[] = [];
			for (const file of files) {
				try {
					const text = await readFile(file, 'utf8');
					const relativeFile = file.replace(
						`${ctx.workspaceRoot}/`,
						'',
					);
					if (stringHasLegacyIdentity(text)) {
						steps.push({
							kind: 'rewrite-agent-file',
							detail: relativeFile,
						});
					}
					const target = renamedPath(file);
					if (target !== undefined && !(await pathExists(target))) {
						steps.push({
							kind: 'rename',
							detail: `agent file: ${relativeFile} → ${target.replace(`${ctx.workspaceRoot}/`, '')}`,
						});
					}
				} catch {
					// unreadable file — skip silently; the engine will
					// surface this as a structured error elsewhere.
				}
			}
			return steps;
		},

		apply: async (ctx) => {
			const files = await listAgentFiles(ctx.workspaceRoot);
			for (const file of files) {
				const next = await rewriteAgentFile(file).catch(() => null);
				if (next !== null) await writeFileAtomic(file, next);
				const target = renamedPath(file);
				// Never over another file: one already at the new name is
				// the person's, and the old one is left for them to merge.
				if (target !== undefined && !(await pathExists(target))) {
					await rename(file, target);
				}
			}
		},
	};
};

export { stringHasLegacyIdentity };
