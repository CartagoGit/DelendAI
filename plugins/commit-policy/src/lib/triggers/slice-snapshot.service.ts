/**
 * slice-snapshot.service.ts — the slices of every proposal, read from the
 * proposal documents, which are their authority.
 *
 * The listener used to read the proposals registry for the list of
 * documents, then read every document for its slices: the registry
 * carries no slices. So each poll read the whole tree anyway, once a
 * second, and the list it read it by was a projection that could be
 * behind the tree — newer proposals missing, moved ones under their old
 * folder. Now the folder itself is listed, and a document is read again
 * only when its size or modification time changed since the last poll.
 */
import type { SafeWorkspaceReader } from '@delendai/core/public';

import type {
	ISliceSnapshotEntry,
	ISliceSnapshotReader,
} from '../contracts/interfaces/slice-snapshot.interface';

/** A proposal document's name: its id, a dash, its title. */
const DOCUMENT_RE = /^([a-z]\d{5}[a-z]*)-.*\.md$/u;

/** One entry of a `Files` list, without list markers, brackets or backticks. */
const cleanFileEntry = (entry: string): string =>
	entry
		.trim()
		.replace(/^[-*]\s+/u, '')
		.replace(/^\[|\]$/gu, '')
		.trim()
		.replace(/^`|`$/gu, '')
		.trim();

/**
 * The paths a slice's `Files` field names, in every shape proposals use:
 * inline (`- **Files**: a, b`), bracketed (`[`a`, `b`]`) or a nested list
 * on the following lines. The match stays on the field's own line: a
 * pattern that let whitespace cross the newline read only the first
 * nested bullet, with its `- \`` prefix, and dropped the rest.
 */
export const parseSliceFilesField = (body: string): string[] => {
	const lines = body.split('\n');
	const files: string[] = [];
	for (let index = 0; index < lines.length; index += 1) {
		const field = /^[-*][ \t]*(?:files|\*\*Files\*\*):[ \t]*(.*)$/iu.exec(
			lines[index] ?? '',
		);
		if (field === null) continue;
		const inline = (field[1] ?? '').trim();
		if (inline.length > 0) {
			files.push(...inline.split(',').map(cleanFileEntry));
			continue;
		}
		for (let next = index + 1; next < lines.length; next += 1) {
			const bullet = /^[ \t]+[-*][ \t]+(.+)$/u.exec(lines[next] ?? '');
			if (bullet === null) break;
			files.push(cleanFileEntry(bullet[1] ?? ''));
		}
	}
	return files.filter((file) => file.length > 0);
};

interface IParsedSlice {
	readonly id: string;
	readonly status: string;
	readonly files: readonly string[];
}

/** The slices a proposal document declares. */
export const slicesOfDocument = (markdown: string): readonly IParsedSlice[] => {
	const section = markdown.match(
		/^##(?:\s+\d+\.)?\s*Slices\b[^\n]*$([\s\S]*?)(?=^## (?!#)|\n*$(?![\s\S]))/imu,
	)?.[1];
	if (section === undefined) return [];
	return [
		...section.matchAll(
			/^### (\S+)\s+—\s+[^\n]*$([\s\S]*?)(?=^### |\n*$(?![\s\S]))/gmu,
		),
	].map((match) => {
		const body = match[2] ?? '';
		return {
			id: match[1] ?? '',
			status:
				body
					.match(
						/^[-*]\s*(?:status|\*\*Status\*\*):\s*`?([^`\n]+)`?\s*$/mu,
					)?.[1]
					?.trim() ?? 'unknown',
			files: parseSliceFilesField(body),
		};
	});
};

/** A reader of `proposalsDir` that re-reads only what changed. */
export const createSliceSnapshotReader = (
	reader: SafeWorkspaceReader,
	proposalsDir: string,
): ISliceSnapshotReader => {
	const cache = new Map<
		string,
		{ readonly stamp: string; readonly slices: readonly IParsedSlice[] }
	>();
	return {
		read: async () => {
			let listed: Awaited<ReturnType<SafeWorkspaceReader['list']>>;
			try {
				listed = await reader.list(proposalsDir, {
					recursive: true,
					maxDepth: 4,
				});
			} catch {
				return undefined;
			}
			const seen = new Set<string>();
			const slices = new Map<string, ISliceSnapshotEntry>();
			for (const entry of listed.entries) {
				if (!entry.stats.isFile()) continue;
				const path = entry.path.relativePath;
				const id = DOCUMENT_RE.exec(path.split('/').pop() ?? '')?.[1];
				if (id === undefined) continue;
				seen.add(path);
				const stamp = `${String(entry.stats.size)}:${String(entry.stats.mtimeMs)}`;
				let parsed = cache.get(path);
				if (parsed?.stamp !== stamp) {
					try {
						parsed = {
							stamp,
							slices: slicesOfDocument(
								(await reader.readText(path)).content,
							),
						};
					} catch {
						// Gone or unreadable since it was listed.
						continue;
					}
					cache.set(path, parsed);
				}
				for (const slice of parsed.slices) {
					if (slice.id.length === 0) continue;
					slices.set(`${id}-${slice.id}`, {
						status: slice.status,
						proposalId: id,
						...(slice.files.length > 0
							? { files: slice.files }
							: {}),
					});
				}
			}
			for (const path of cache.keys()) {
				if (!seen.has(path)) cache.delete(path);
			}
			return slices;
		},
	};
};
