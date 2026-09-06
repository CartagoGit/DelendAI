import { mkdir, open } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';

import {
	SafeWorkspaceReader,
	safeListDirRequired,
	withFileMutex,
} from '@delendai/core/public';

export type TQuarantineReason =
	| 'invalid_canonical_filename'
	| 'no_frontmatter'
	| 'invalid_status'
	| 'invalid_frontmatter_shape';

export interface IQuarantineEntry {
	readonly id: number;
	readonly absPath: string;
	readonly blobSha: string;
	readonly sourceCommitSha: string;
	readonly detectedAt: number;
	readonly reason: TQuarantineReason;
	readonly detail: string;
	readonly rawMetadata: string;
}

interface IQuarantineJsonlEntry {
	readonly id: number;
	readonly abs_path: string;
	readonly blob_sha: string;
	readonly source_commit_sha: string;
	readonly detected_at: number;
	readonly reason: TQuarantineReason;
	readonly detail: string;
	readonly raw_metadata: string;
}

const QUARANTINE_FILE_REL = '.cache/delendai/proposals/quarantine.jsonl';

const quarantinePath = (root: string): string =>
	join(root, QUARANTINE_FILE_REL);

const normalizeEntry = (value: unknown): IQuarantineEntry | null => {
	if (value === null || typeof value !== 'object') return null;
	const record = value as Partial<IQuarantineJsonlEntry> &
		Partial<IQuarantineEntry> & { [key: string]: unknown };
	const id =
		typeof record.id === 'number' && Number.isFinite(record.id)
			? record.id
			: null;
	const absPath =
		typeof record.abs_path === 'string'
			? record.abs_path
			: typeof record.absPath === 'string'
				? record.absPath
				: null;
	const blobSha =
		typeof record.blob_sha === 'string'
			? record.blob_sha
			: typeof record.blobSha === 'string'
				? record.blobSha
				: null;
	const sourceCommitSha =
		typeof record.source_commit_sha === 'string'
			? record.source_commit_sha
			: typeof record.sourceCommitSha === 'string'
				? record.sourceCommitSha
				: null;
	const detectedAt =
		typeof record.detected_at === 'number'
			? record.detected_at
			: typeof record.detectedAt === 'number'
				? record.detectedAt
				: null;
	const reason =
		record.reason === 'invalid_canonical_filename' ||
		record.reason === 'no_frontmatter' ||
		record.reason === 'invalid_status' ||
		record.reason === 'invalid_frontmatter_shape'
			? record.reason
			: null;
	if (
		id === null ||
		absPath === null ||
		blobSha === null ||
		sourceCommitSha === null ||
		detectedAt === null ||
		reason === null
	) {
		return null;
	}
	return {
		id,
		absPath,
		blobSha,
		sourceCommitSha,
		detectedAt,
		reason,
		detail: typeof record.detail === 'string' ? record.detail : '',
		rawMetadata:
			typeof record.raw_metadata === 'string'
				? record.raw_metadata
				: typeof record.rawMetadata === 'string'
					? record.rawMetadata
					: '',
	};
};

const toJsonlEntry = (entry: IQuarantineEntry): IQuarantineJsonlEntry => ({
	id: entry.id,
	abs_path: entry.absPath,
	blob_sha: entry.blobSha,
	source_commit_sha: entry.sourceCommitSha,
	detected_at: entry.detectedAt,
	reason: entry.reason,
	detail: entry.detail,
	raw_metadata: entry.rawMetadata,
});

const readQuarantineText = async (pathAbs: string): Promise<string> => {
	const dirAbs = dirname(pathAbs);
	const fileName = basename(pathAbs);
	const dirents = await safeListDirRequired(dirAbs);
	const exists = dirents.some(
		(dirent) => dirent.isFile() && String(dirent.name) === fileName,
	);
	if (!exists) return '';
	return (
		await new SafeWorkspaceReader(dirAbs).readText(fileName).catch(() => ({
			content: '',
		}))
	).content;
};

export const listQuarantine = async (
	root: string,
): Promise<readonly IQuarantineEntry[]> => {
	const pathAbs = quarantinePath(root);
	const text = await readQuarantineText(pathAbs);
	const entries: IQuarantineEntry[] = [];
	for (const line of text.split('\n')) {
		if (line.trim() === '') continue;
		try {
			const parsed = normalizeEntry(JSON.parse(line));
			if (parsed !== null) entries.push(parsed);
		} catch {
			continue;
		}
	}
	return entries;
};

export const appendQuarantine = async (
	root: string,
	entry: Omit<IQuarantineEntry, 'id'>,
): Promise<IQuarantineEntry> => {
	const pathAbs = quarantinePath(root);
	await mkdir(dirname(pathAbs), { recursive: true });
	return withFileMutex(pathAbs, async () => {
		const existing = await listQuarantine(root);
		const nextId =
			existing.reduce(
				(maxId, current) => Math.max(maxId, current.id),
				0,
			) + 1;
		const nextEntry: IQuarantineEntry = {
			id: nextId,
			...entry,
		};
		const handle = await open(pathAbs, 'a');
		try {
			await handle.writeFile(
				`${JSON.stringify(toJsonlEntry(nextEntry))}\n`,
				'utf8',
			);
			await handle.sync();
		} finally {
			await handle.close();
		}
		return nextEntry;
	});
};
