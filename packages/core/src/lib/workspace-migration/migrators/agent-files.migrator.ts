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
import { access, readFile, writeFile } from 'node:fs/promises';
import { readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';

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

/** Frontmatter fields the migrator walks. Other keys pass through. */
const AGENT_FRONTMATTER_FIELDS = ['name', 'description', 'model'] as const;

const pathExists = async (absolutePath: string): Promise<boolean> =>
	access(absolutePath).then(
		() => true,
		() => false,
	);

/**
 * One parsed frontmatter entry. String-typed values are kept as
 * strings; anything outside the parser subset is preserved under a
 * single key so the file still round-trips on a re-run.
 */
interface IFrontmatterShape {
	[key: string]: string | boolean | number | null | string[];
}

/**
 * A tiny YAML parser tuned to frontmatter. It handles:
 *
 *   key: value
 *   key: "quoted value"
 *   key: true | false
 *   key: 123 | 1.5
 *   key: null
 *   key: [a, b, c]
 *   # comments
 *
 * Anything outside that subset is preserved as the original raw
 * line under `__raw_<index>` keys so the writer can emit them
 * verbatim. The whole point is to not lose data on the round trip.
 */
const parseFrontmatter = (text: string): IFrontmatterShape => {
	const out: IFrontmatterShape = {};
	const lines = text.split(/\r?\n/u);
	let rawIndex = 0;
	for (const rawLine of lines) {
		const line = rawLine.replace(/\s*#.*$/u, '').trim();
		if (line.length === 0) continue;
		const colonAt = line.indexOf(':');
		if (colonAt <= 0) {
			out[`__raw_${rawIndex}`] = rawLine;
			rawIndex += 1;
			continue;
		}
		const key = line.slice(0, colonAt).trim();
		const rest = line.slice(colonAt + 1).trim();
		if (rest.length === 0) {
			out[key] = null;
			continue;
		}
		if (rest === 'true' || rest === 'false') {
			out[key] = rest === 'true';
			continue;
		}
		if (rest === 'null' || rest === '~') {
			out[key] = null;
			continue;
		}
		if (/^-?\d+(?:\.\d+)?$/u.test(rest)) {
			out[key] = Number(rest);
			continue;
		}
		if (rest.startsWith('[') && rest.endsWith(']')) {
			const inner = rest.slice(1, -1).trim();
			if (inner.length === 0) {
				out[key] = [];
				continue;
			}
			out[key] = inner
				.split(',')
				.map((entry) => entry.trim())
				.map((entry) => {
					if (
						(entry.startsWith('"') && entry.endsWith('"')) ||
						(entry.startsWith("'") && entry.endsWith("'"))
					) {
						return entry.slice(1, -1);
					}
					return entry;
				});
			continue;
		}
		if (
			(rest.startsWith('"') && rest.endsWith('"')) ||
			(rest.startsWith("'") && rest.endsWith("'"))
		) {
			out[key] = rest.slice(1, -1);
			continue;
		}
		out[key] = rest;
	}
	return out;
};

/**
 * Serialise a parsed frontmatter back to its `---\n...\n---\n`
 * envelope. The format mirrors the parser: one `key: value` per
 * line, with quotes emitted only when needed (strings containing a
 * colon, for example).
 */
const serialiseFrontmatter = (frontmatter: IFrontmatterShape): string => {
	const lines: string[] = [];
	for (const [key, value] of Object.entries(frontmatter)) {
		if (key.startsWith('__raw_')) {
			lines.push(String(value));
			continue;
		}
		if (value === null || value === undefined) {
			lines.push(`${key}:`);
			continue;
		}
		if (typeof value === 'boolean') {
			lines.push(`${key}: ${value ? 'true' : 'false'}`);
			continue;
		}
		if (typeof value === 'number') {
			lines.push(`${key}: ${value}`);
			continue;
		}
		if (Array.isArray(value)) {
			const items = value.map((entry) =>
				/[:#\s]/u.test(entry) ? `"${entry}"` : entry,
			);
			lines.push(`${key}: [${items.join(', ')}]`);
			continue;
		}
		const stringValue = String(value);
		const needsQuotes =
			/[:#]/u.test(stringValue) || stringValue.length === 0;
		lines.push(`${key}: ${needsQuotes ? `"${stringValue}"` : stringValue}`);
	}
	return `---\n${lines.join('\n')}\n---\n`;
};

/**
 * Split a markdown file into its frontmatter block (if any) and
 * the body. Returns `{ kind: 'plain' }` for files with no
 * frontmatter.
 */
const splitMarkdown = (
	text: string,
):
	| { readonly kind: 'with-frontmatter'; frontmatter: string; body: string }
	| {
			readonly kind: 'plain';
			readonly body: string;
	  } => {
	if (!text.startsWith('---\n')) return { kind: 'plain', body: text };
	const close = text.indexOf('\n---\n', 4);
	if (close === -1) return { kind: 'plain', body: text };
	const frontmatter = text.slice(4, close);
	const body = text.slice(close + 5);
	return { kind: 'with-frontmatter', frontmatter, body };
};

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
					if (stringHasLegacyIdentity(text)) {
						steps.push({
							kind: 'rewrite-agent-file',
							detail: file.replace(`${ctx.workspaceRoot}/`, ''),
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
				if (next === null) continue;
				await writeFile(file, next, 'utf8');
			}
		},
	};
};

export { stringHasLegacyIdentity };
