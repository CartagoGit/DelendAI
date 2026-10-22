/**
 * publication-dispositions.service.ts — a pull request that waits on its
 * author is said to its author.
 *
 * The queue refresh decides, on every pass, what moves each pull request
 * next, and for a red one whose fix is its author's it could only log "its
 * author pushes next" — every pass, to a log nobody reads, while the
 * author's `work status` showed nothing. The refresh now keeps its last
 * verdicts in the cache; `work status` reads them and names each pull
 * request that waits on its author.
 */
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { DEFAULT_CACHE_DIR } from '../contracts/constants/delendai-records.constant';
import {
	AUTHOR_DISPOSITION,
	PUBLICATION_DISPOSITIONS_FILE,
} from '../contracts/constants/publication-dispositions.constant';
import type {
	IPublicationDisposition,
	IPublicationDispositions,
} from '../contracts/interfaces/publication-disposition.interface';
import { writeFileAtomic } from '../shared/atomic-write';

/** The file under a workspace's cache, where the refresh writes it. */
export const publicationDispositionsPath = (root: string): string =>
	join(root, DEFAULT_CACHE_DIR, PUBLICATION_DISPOSITIONS_FILE);

export const writePublicationDispositions = async (
	root: string,
	dispositions: readonly IPublicationDisposition[],
	now: Date = new Date(),
): Promise<void> => {
	const record: IPublicationDispositions = {
		at: now.toISOString(),
		dispositions,
	};
	await writeFileAtomic(
		publicationDispositionsPath(root),
		`${JSON.stringify(record, null, '\t')}\n`,
	);
};

/** The pull requests the last pass left to their author; none when unread. */
export const waitingOnAuthor = async (
	root: string,
): Promise<readonly IPublicationDisposition[]> => {
	try {
		const parsed = JSON.parse(
			await readFile(publicationDispositionsPath(root), 'utf8'),
		) as Partial<IPublicationDispositions>;
		return (parsed.dispositions ?? []).filter(
			(entry) => entry.disposition === AUTHOR_DISPOSITION,
		);
	} catch {
		return [];
	}
};
