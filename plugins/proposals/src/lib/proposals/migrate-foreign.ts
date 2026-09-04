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
import { readdir, rm, stat } from 'node:fs/promises';
import { join, relative } from 'node:path';

import {
	redactSecrets,
	resolveWorkspaceContained,
	SafeWorkspaceReader,
	writeFileAtomic,
} from '@delendai/core/public';

import {
	PROPOSAL_KINDS,
	STATUS_TO_FOLDER,
	type IProposalKind,
	type IProposalStatus,
} from '../contracts/constants/proposal-glossary.constant';
import { slugFromTitle } from '../shared/string-helpers';
import { allocateNextProposalId } from './proposal-id-allocator';

export interface IMigrateForeignOptions {
	readonly workspaceRoot: string;
	readonly proposalsDirAbs: string;
	readonly counterPathAbs: string;
	/** Workspace-relative files or directories to migrate from. */
	readonly roots: readonly string[];
	/** Remove successfully migrated source files for explicit archive roots. */
	readonly removeMigratedSources?: boolean;
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

/** Foreign status spellings → canonical status (glossary single source). */
const FOREIGN_STATUS_MAP: Readonly<Record<string, IProposalStatus>> = {
	done: 'done',
	closed: 'done',
	completed: 'done',
	merged: 'done',
	shipped: 'done',
	archived: 'retired',
	obsolete: 'retired',
	superseded: 'retired',
	wontfix: 'retired',
	cancelled: 'retired',
	canceled: 'retired',
	ready: 'ready',
	todo: 'ready',
	backlog: 'ready',
	'in-progress': 'in-progress',
	in_progress: 'in-progress',
	wip: 'in-progress',
	review: 'review',
	'in-review': 'review',
	paused: 'paused',
	deferred: 'paused',
	'on-hold': 'paused',
	on_hold: 'paused',
	blocked: 'blocked',
};

/** Canonical status for a foreign status string (unknown → ready). */
const statusFor = (raw: string): IProposalStatus => {
	const normalized = raw.trim().toLowerCase();
	return FOREIGN_STATUS_MAP[normalized] ?? 'ready';
};

const FIX_TITLE = /\b(fix|bug|crash|error|broken|regression)\b/i;

/** Resolve a canonical kind from foreign metadata (kind/type fields). */
const kindFromMetadata = (
	kind: string | undefined,
	type: string | undefined,
): IProposalKind | undefined => {
	for (const raw of [kind, type]) {
		if (raw === undefined) continue;
		const normalized = raw.trim().toLowerCase();
		if (Object.hasOwn(PROPOSAL_KINDS, normalized)) {
			return normalized as IProposalKind;
		}
		if (normalized === 'bug' || normalized === 'defect') return 'fix';
		if (
			normalized === 'feature' ||
			normalized === 'improvement' ||
			normalized === 'enhancement'
		) {
			return 'feat';
		}
	}
	return undefined;
};

/**
 * Canonical kind for a candidate: preserved metadata first, then the
 * title heuristic as a LAST resort for shapes that carry no metadata
 * (checklists, rfc-style prose) — a known kind is never overwritten by
 * the title regex.
 */
const kindFor = (
	candidate: ICandidate,
): { kind: IProposalKind; prefix: string } => {
	const kind =
		kindFromMetadata(candidate.kind, candidate.type) ??
		(FIX_TITLE.test(candidate.title) ? 'fix' : 'feat');
	const prefix = PROPOSAL_KINDS[kind].prefix;
	return { kind, prefix };
};

const isAuditSource = (source: string): boolean =>
	/(?:^|\/)audits(?:\/|$)/u.test(source);

interface ICandidate {
	/** Provenance key (`rel` or `rel#slug`). */
	readonly source: string;
	readonly title: string;
	readonly body: string;
	/** Canonical status (resolved from foreign spellings). */
	readonly status: IProposalStatus;
	/** Kind preserved from frontmatter metadata, when present. */
	readonly kind: string | undefined;
	/** Legacy type field preserved from frontmatter, when present. */
	readonly type: string | undefined;
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
	const rawStatus = field('status') ?? 'ready';
	return {
		source: rel,
		title,
		body: text.slice(block[0].length).trim(),
		status: statusFor(rawStatus),
		kind: field('kind'),
		type: field('type'),
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
		// x00157 S1: `kebab(title)` collapses to '' for any non-ASCII
		// title, which would make every non-ASCII checklist item in the
		// SAME source file collide on `${rel}#` and get silently
		// deduped against each other via `alreadyMigrated.has(...)`.
		// `match.index` (this occurrence's character offset in `text`)
		// is unique per checklist item regardless of title content.
		const source = `${rel}#${slugFromTitle(title, `item-${match.index ?? 0}`)}`;
		if (checked) {
			skipped.push({
				source,
				reason: 'checked (already done in the source checklist)',
			});
			continue;
		}
		candidates.push({
			source,
			title,
			body: '',
			status: 'ready',
			kind: undefined,
			type: undefined,
		});
	}
	return { candidates, skipped };
};

const parseRfcShape = (rel: string, text: string): ICandidate | null => {
	const heading = text.match(/^#\s+(.+)$/m);
	if (heading === null) return null;
	const title = (heading[1] ?? '').trim();
	if (title.length === 0) return null;
	const body = text.slice((heading.index ?? 0) + heading[0].length).trim();
	return {
		source: rel,
		title,
		body,
		status: 'ready',
		kind: undefined,
		type: undefined,
	};
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
	onlyKind?: IProposalKind,
): Promise<Set<string>> => {
	const sources = new Set<string>();
	const reader = new SafeWorkspaceReader(proposalsDirAbs);
	const walk = async (dirAbs: string): Promise<void> => {
		const entries = await readdir(dirAbs, { withFileTypes: true }).catch(
			() => [],
		);
		for (const entry of entries) {
			const abs = join(dirAbs, entry.name);
			if (entry.isDirectory()) await walk(abs);
			else if (entry.name.endsWith('.md')) {
				const text = await reader
					.readText(
						relative(proposalsDirAbs, abs).split('\\').join('/'),
					)
					.then((value) => value.content)
					.catch(() => '');
				if (
					onlyKind !== undefined &&
					!new RegExp(`^kind:\\s*${onlyKind}\\s*$`, 'm').test(text)
				) {
					continue;
				}
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
	const migratedAudits = await readMigratedSources(
		options.proposalsDirAbs,
		'audit',
	);

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
		const text = await new SafeWorkspaceReader(options.workspaceRoot)
			.readText(rel)
			.then((value) => value.content)
			.catch(() => '');
		if (text.length === 0) {
			skipped.push({ source: rel, reason: 'unreadable or empty' });
			continue;
		}

		const candidates: ICandidate[] = [];
		const auditSource = isAuditSource(rel);
		const checklist = auditSource ? null : parseChecklistShape(rel, text);
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
			const auditSource = isAuditSource(candidate.source);
			const alreadyKnown = auditSource
				? migratedAudits.has(candidate.source)
				: alreadyMigrated.has(candidate.source);
			if (alreadyKnown) {
				if (
					options.removeMigratedSources &&
					isAuditSource(candidate.source) &&
					!candidate.source.includes('#')
				) {
					await rm(join(options.workspaceRoot, candidate.source), {
						force: true,
					});
				}
				skipped.push({
					source: candidate.source,
					reason: 'already migrated (provenance found in the store)',
				});
				continue;
			}
			const { kind: inferredKind } = kindFor(candidate);
			const kind = auditSource ? 'audit' : inferredKind;
			const prefix = PROPOSAL_KINDS[kind].prefix;
			const id = await allocateNextProposalId(prefix, {
				proposalsDirAbs: options.proposalsDirAbs,
				counterPathAbs: options.counterPathAbs,
			});
			const status = auditSource ? 'done' : candidate.status;
			const folder = STATUS_TO_FOLDER[status];
			const kindFolder = kind === 'audit' ? 'audits/' : '';
			const filename = `${id}-${slugFromTitle(candidate.title, id)}.md`;
			const targetAbs = join(
				options.proposalsDirAbs,
				folder,
				kindFolder,
				filename,
			);
			const { text: safeBody } = redactSecrets(
				renderProposal(id, { ...candidate, status }, kind),
			);
			await writeFileAtomic(targetAbs, safeBody);
			if (
				options.removeMigratedSources &&
				!candidate.source.includes('#')
			) {
				await rm(join(options.workspaceRoot, candidate.source), {
					force: true,
				});
			}
			alreadyMigrated.add(candidate.source);
			if (auditSource) migratedAudits.add(candidate.source);
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
