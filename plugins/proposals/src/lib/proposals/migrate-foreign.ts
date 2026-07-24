/**
 * migrate-foreign.ts — convert FOREIGN proposal schemes into canonical
 * mcp-vertex proposals (f00116 S2).
 *
 * Three shapes are recognised, in priority order per file:
 *
 *   1. **Checklist** (`- [ ] item`): every unchecked item becomes one
 *      `ready/` proposal; checked items are skipped (already done).
 *   2. **Ad-hoc frontmatter** (`--- title/status ---`): status maps
 *      through the done-ish synonyms; body is preserved.
 *   3. **Rfc-style** (`# Heading` + prose): one proposal per file.
 *
 * Guarantees: originals are NEVER touched; targets land ONLY under the
 * proposals dir (atomic writes, allocator ids); every migrated file
 * records its provenance (`migrated-from:`) which also makes re-runs
 * idempotent; user text runs through `redactSecrets` before persisting.
 */
import { readFile, readdir, stat } from 'node:fs/promises';
import { join, relative } from 'node:path';

import {
	redactSecrets,
	resolveWorkspaceContained,
	writeFileAtomic,
} from '@mcp-vertex/core/public';

import { kebab } from '../shared/string-helpers';
import { allocateNextProposalId } from './proposal-id-allocator';

export interface IMigrateForeignOptions {
	readonly workspaceRoot: string;
	readonly proposalsDirAbs: string;
	readonly counterPathAbs: string;
	/** Workspace-relative files or directories to migrate from. */
	readonly roots: readonly string[];
}

export interface IMigratedEntry {
	/** Workspace-relative source (a file, or `file#slug` for checklist items). */
	readonly source: string;
	/** Workspace-relative target proposal path. */
	readonly target: string;
	readonly id: string;
	readonly title: string;
}

export interface ISkippedEntry {
	readonly source: string;
	readonly reason: string;
}

export interface IMigrationReport {
	readonly migrated: readonly IMigratedEntry[];
	readonly skipped: readonly ISkippedEntry[];
}

/** Statuses foreign schemes use for "finished". Mirrors adopt.ts. */
const DONE_SYNONYMS = new Set([
	'done',
	'closed',
	'completed',
	'merged',
	'shipped',
	'archived',
]);

const FIX_TITLE = /\b(fix|bug|crash|error|broken|regression)\b/i;

const kindPrefixFor = (title: string): { kind: string; prefix: string } =>
	FIX_TITLE.test(title)
		? { kind: 'fix', prefix: 'x' }
		: { kind: 'feat', prefix: 'f' };

interface ICandidate {
	/** Provenance key (`rel` or `rel#slug`). */
	readonly source: string;
	readonly title: string;
	readonly body: string;
	readonly status: 'ready' | 'done';
}

const parseFrontmatterShape = (
	rel: string,
	text: string,
): ICandidate | null => {
	const block = text.match(/^---\n([\s\S]*?)\n---\n?/);
	if (block === null) return null;
	const field = (key: string): string | undefined =>
		block[1]?.match(new RegExp(`^${key}:\\s*(.+)$`, 'm'))?.[1]?.trim();
	const title = field('title') ?? field('name');
	if (title === undefined || title.length === 0) return null;
	const rawStatus = (field('status') ?? 'ready').toLowerCase();
	return {
		source: rel,
		title,
		body: text.slice(block[0].length).trim(),
		status: DONE_SYNONYMS.has(rawStatus) ? 'done' : 'ready',
	};
};

const CHECKLIST_ITEM = /^-\s*\[( |x|X)\]\s+(.+)$/gm;

const parseChecklistShape = (
	rel: string,
	text: string,
): { candidates: ICandidate[]; skipped: ISkippedEntry[] } | null => {
	const matches = [...text.matchAll(CHECKLIST_ITEM)];
	if (matches.length === 0) return null;
	const candidates: ICandidate[] = [];
	const skipped: ISkippedEntry[] = [];
	for (const match of matches) {
		const checked = match[1] !== ' ';
		const title = (match[2] ?? '').trim();
		const source = `${rel}#${kebab(title)}`;
		if (checked) {
			skipped.push({
				source,
				reason: 'checked (already done in the source checklist)',
			});
			continue;
		}
		candidates.push({ source, title, body: '', status: 'ready' });
	}
	return { candidates, skipped };
};

const parseRfcShape = (rel: string, text: string): ICandidate | null => {
	const heading = text.match(/^#\s+(.+)$/m);
	if (heading === null) return null;
	const title = (heading[1] ?? '').trim();
	if (title.length === 0) return null;
	const body = text.slice((heading.index ?? 0) + heading[0].length).trim();
	return { source: rel, title, body, status: 'ready' };
};

/** Walk a contained root and return every `.md` file (workspace-relative). */
const collectMarkdown = async (
	workspaceRoot: string,
	absRoot: string,
): Promise<string[]> => {
	const rootStat = await stat(absRoot).catch(() => null);
	if (rootStat === null) return [];
	if (rootStat.isFile()) {
		return absRoot.toLowerCase().endsWith('.md')
			? [relative(workspaceRoot, absRoot)]
			: [];
	}
	const out: string[] = [];
	const entries = await readdir(absRoot, { withFileTypes: true }).catch(
		() => [],
	);
	for (const entry of entries) {
		const abs = join(absRoot, entry.name);
		if (entry.isDirectory()) {
			if (entry.name === 'node_modules' || entry.name === '.git')
				continue;
			out.push(...(await collectMarkdown(workspaceRoot, abs)));
		} else if (entry.name.toLowerCase().endsWith('.md')) {
			out.push(relative(workspaceRoot, abs));
		}
	}
	return out.sort();
};

/** Provenance registry: every `migrated-from:` already present in the store. */
const readMigratedSources = async (
	proposalsDirAbs: string,
): Promise<Set<string>> => {
	const sources = new Set<string>();
	const walk = async (dirAbs: string): Promise<void> => {
		const entries = await readdir(dirAbs, { withFileTypes: true }).catch(
			() => [],
		);
		for (const entry of entries) {
			const abs = join(dirAbs, entry.name);
			if (entry.isDirectory()) await walk(abs);
			else if (entry.name.endsWith('.md')) {
				const text = await readFile(abs, 'utf8').catch(() => '');
				for (const match of text.matchAll(
					/^migrated-from:\s*(.+)$/gm,
				)) {
					const source = match[1]?.trim();
					if (source !== undefined && source.length > 0)
						sources.add(source);
				}
			}
		}
	};
	await walk(proposalsDirAbs);
	return sources;
};

const renderProposal = (
	id: string,
	candidate: ICandidate,
	kind: string,
): string => {
	const today = new Date().toISOString().slice(0, 10);
	const goal =
		candidate.body.length > 0
			? candidate.body
			: `Migrated work item: ${candidate.title}.`;
	return [
		'---',
		`id: ${id}`,
		`title: "${candidate.title.replaceAll('"', "'")}"`,
		`kind: ${kind}`,
		`status: ${candidate.status}`,
		'type: proposal',
		'track: migrated',
		`date: ${today}`,
		`migrated-from: ${candidate.source}`,
		'---',
		'',
		`# ${id} — ${candidate.title}`,
		'',
		'## Goal',
		'',
		goal,
		'',
		'## notes',
		'',
		`- Migrated from \`${candidate.source}\` by \`proposal_adopt\``,
		'  (f00116). The original file was left untouched — retire it once',
		'  this proposal is the source of truth.',
		'',
	].join('\n');
};

/**
 * Convert every recognised foreign document under `roots` into a
 * canonical proposal. Pure over its options; all writes land under
 * `proposalsDirAbs`.
 */
export const migrateForeign = async (
	options: IMigrateForeignOptions,
): Promise<IMigrationReport> => {
	const migrated: IMigratedEntry[] = [];
	const skipped: ISkippedEntry[] = [];
	const alreadyMigrated = await readMigratedSources(options.proposalsDirAbs);

	const files: string[] = [];
	for (const root of options.roots) {
		const contained = resolveWorkspaceContained(
			options.workspaceRoot,
			root,
		);
		if (!contained.ok) {
			skipped.push({
				source: root,
				reason: contained.reason ?? 'escapes the workspace',
			});
			continue;
		}
		// Never treat the store itself as a foreign scheme.
		if (
			contained.abs === options.proposalsDirAbs ||
			contained.abs.startsWith(`${options.proposalsDirAbs}/`)
		) {
			skipped.push({
				source: root,
				reason: 'is the proposals store itself',
			});
			continue;
		}
		files.push(
			...(await collectMarkdown(options.workspaceRoot, contained.abs)),
		);
	}

	for (const rel of files) {
		const text = await readFile(
			join(options.workspaceRoot, rel),
			'utf8',
		).catch(() => '');
		if (text.length === 0) {
			skipped.push({ source: rel, reason: 'unreadable or empty' });
			continue;
		}

		const checklist = parseChecklistShape(rel, text);
		const candidates: ICandidate[] = [];
		if (checklist !== null) {
			candidates.push(...checklist.candidates);
			skipped.push(...checklist.skipped);
		} else {
			const single =
				parseFrontmatterShape(rel, text) ?? parseRfcShape(rel, text);
			if (single === null) {
				skipped.push({
					source: rel,
					reason: 'unrecognized shape (no frontmatter title, heading, or checklist)',
				});
				continue;
			}
			candidates.push(single);
		}

		for (const candidate of candidates) {
			if (alreadyMigrated.has(candidate.source)) {
				skipped.push({
					source: candidate.source,
					reason: 'already migrated (provenance found in the store)',
				});
				continue;
			}
			const { kind, prefix } = kindPrefixFor(candidate.title);
			const id = await allocateNextProposalId(prefix, {
				proposalsDirAbs: options.proposalsDirAbs,
				counterPathAbs: options.counterPathAbs,
			});
			const folder = candidate.status === 'done' ? 'done' : 'ready';
			const filename = `${id}-${kebab(candidate.title)}.md`;
			const targetAbs = join(options.proposalsDirAbs, folder, filename);
			const { text: safeBody } = redactSecrets(
				renderProposal(id, candidate, kind),
			);
			await writeFileAtomic(targetAbs, safeBody);
			alreadyMigrated.add(candidate.source);
			migrated.push({
				source: candidate.source,
				target: relative(options.workspaceRoot, targetAbs),
				id,
				title: candidate.title,
			});
		}
	}

	return { migrated, skipped };
};
