/**
 * file-proposals.ts — f00139 S3: convert ranked self-audit backlog
 * items into minimal proposal drafts and optionally write them.
 */

import { access, mkdir, readdir } from 'node:fs/promises';
import path from 'node:path';

import { type IFinding, writeFileAtomic } from '@delendai/core/public';

import type { IBacklog } from '../contracts/interfaces/backlog.interface';

export interface IFileProposalsInput {
	/** The ranked backlog from `rankFindings()` (highest priority first). */
	readonly backlog: IBacklog;
	/** Working directory the generated proposal files should target. */
	readonly proposalsDirAbs: string;
	/** Injected writer; defaults to atomic markdown file writes on disk. */
	readonly writeProposal?: (draft: IProposalDraft) => Promise<string>;
	/** Injected ISO clock. Default: `new Date().toISOString()`. */
	readonly now?: () => string;
	/** Caller opt-in; when false, no files are written. */
	readonly consent: boolean;
	/** Max proposals to file in one run. Default: 3. */
	readonly limit?: number;
}

export interface IProposalDraft {
	/** Repo-local absolute path the caller can review and then `git add`. */
	readonly absPath: string;
	/** Full markdown body ready for review/commit. */
	readonly body: string;
	/** Source finding for traceability. */
	readonly finding: IFinding;
	/** Rank position from the input backlog. */
	readonly rank: number;
	/** Stable generated proposal id. */
	readonly proposalId: string;
}

export interface IFileProposalsResult {
	/** Number of drafts actually written. */
	readonly filed: number;
	/** Number of items skipped (no consent, over limit, or duplicate). */
	readonly skipped: number;
	/** Drafts written in the same order they were filed. */
	readonly drafts: readonly IProposalDraft[];
	/** ISO timestamp of when the function ran. */
	readonly ranAt: string;
}

const DEFAULT_LIMIT = 3;
const MIN_SLUG_LENGTH = 5;
const MAX_SLUG_LENGTH = 30;

const fnv1a = (input: string): number => {
	let hash = 0x811c9dc5;
	for (const char of input) {
		hash ^= char.charCodeAt(0);
		hash = Math.imul(hash, 0x01000193);
	}
	return hash >>> 0;
};

const proposalIdFor = (finding: IFinding): string =>
	`f00${String(fnv1a(finding.ruleId) % 100000).padStart(5, '0')}`;

const truncateSlug = (slug: string): string => {
	const trimmed = slug.slice(0, MAX_SLUG_LENGTH).replace(/-+$/g, '');
	if (trimmed.length >= MIN_SLUG_LENGTH) return trimmed;
	return 'finding';
};

const slugify = (message: string): string => {
	const slug = message
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '');
	return truncateSlug(slug.length === 0 ? 'finding' : slug);
};

const titleFor = (finding: IFinding): string =>
	finding.message.replace(/\s+/g, ' ').trim();

const goalFor = (finding: IFinding): string => {
	const target = finding.location?.file ?? 'the workspace';
	return (
		`Triage self-audit finding ${finding.ruleId} in ${target}: ` +
		`${finding.message}.`
	);
};

const bodyFor = (
	proposalId: string,
	finding: IFinding,
	runDate: string,
): string => {
	const title = titleFor(finding);
	return [
		'---',
		`id: ${proposalId}`,
		'kind: fix',
		`title: ${title}`,
		'status: pending',
		`date: ${runDate.slice(0, 10)}`,
		'track: auto-derived',
		'---',
		'',
		`# ${proposalId} — ${title}`,
		'',
		'## goal',
		'',
		goalFor(finding),
		'',
		'## slices',
		'',
		'- Triage this finding and define a fix; see the source finding in the audit backlog.',
		'',
	].join('\n');
};

const defaultWriteProposal = async (draft: IProposalDraft): Promise<string> => {
	await mkdir(path.dirname(draft.absPath), { recursive: true });
	await writeFileAtomic(draft.absPath, draft.body);
	return draft.absPath;
};

const existingReadyFiles = async (
	proposalsDirAbs: string,
): Promise<Set<string>> => {
	const readyDir = path.join(proposalsDirAbs, 'ready');
	try {
		return new Set(await readdir(readyDir));
	} catch {
		return new Set();
	}
};

const resolveFilename = (
	seen: Set<string>,
	proposalId: string,
	baseSlug: string,
): { readonly filename: string; readonly proposalId: string } | undefined => {
	const exact = `${proposalId}-${baseSlug}.md`;
	if (seen.has(exact)) return undefined;

	let proposalSuffix = 0;
	while (proposalSuffix < 1000) {
		const candidateId =
			proposalSuffix === 0
				? proposalId
				: `${proposalId}-${proposalSuffix}`;
		let slugSuffix = 0;
		while (slugSuffix < 1000) {
			const candidateSlug =
				slugSuffix === 0 ? baseSlug : `${baseSlug}-${slugSuffix}`;
			const filename = `${candidateId}-${candidateSlug}.md`;
			if (!seen.has(filename)) {
				return { filename, proposalId: candidateId };
			}
			slugSuffix += 1;
		}
		proposalSuffix += 1;
	}

	throw new Error('unable to allocate a unique proposal filename');
};

const fileExists = async (absPath: string): Promise<boolean> => {
	try {
		await access(absPath);
		return true;
	} catch {
		return false;
	}
};

const normalizedLimit = (limit: number | undefined): number =>
	Math.max(0, Math.trunc(limit ?? DEFAULT_LIMIT));

export const fileProposalsFromBacklog = async (
	input: IFileProposalsInput,
): Promise<IFileProposalsResult> => {
	const ranAt = (input.now ?? (() => new Date().toISOString()))();
	if (!input.consent) {
		return {
			filed: 0,
			skipped: input.backlog.length,
			drafts: [],
			ranAt,
		};
	}

	const limit = normalizedLimit(input.limit);
	if (input.backlog.length === 0 || limit === 0) {
		return {
			filed: 0,
			skipped: input.backlog.length,
			drafts: [],
			ranAt,
		};
	}

	const writeProposal = input.writeProposal ?? defaultWriteProposal;
	const seen = await existingReadyFiles(input.proposalsDirAbs);
	const drafts: IProposalDraft[] = [];
	let skipped = 0;

	for (const item of input.backlog) {
		if (drafts.length >= limit) {
			skipped += 1;
			continue;
		}

		const resolved = resolveFilename(
			seen,
			proposalIdFor(item.finding),
			slugify(item.finding.message),
		);
		if (resolved === undefined) {
			skipped += 1;
			continue;
		}

		const absPath = path.join(
			input.proposalsDirAbs,
			'ready',
			resolved.filename,
		);
		if (await fileExists(absPath)) {
			skipped += 1;
			seen.add(path.basename(absPath));
			continue;
		}

		const draft: IProposalDraft = {
			absPath,
			body: bodyFor(resolved.proposalId, item.finding, ranAt),
			finding: item.finding,
			rank: item.rank,
			proposalId: resolved.proposalId,
		};
		const writtenAbsPath = await writeProposal(draft);
		const writtenDraft =
			writtenAbsPath === draft.absPath
				? draft
				: { ...draft, absPath: writtenAbsPath };
		drafts.push(writtenDraft);
		seen.add(path.basename(writtenAbsPath));
	}

	return {
		filed: drafts.length,
		skipped,
		drafts,
		ranAt,
	};
};
