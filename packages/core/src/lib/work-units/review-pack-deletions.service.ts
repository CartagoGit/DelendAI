/**
 * review-pack-deletions.service.ts — a unit that records verdicts deletes
 * no document.
 *
 * A review pack removed a closed document from the integration branch:
 * one commit meant to drop a stale copy, and the merges that joined other
 * packs left the canonical one out too. Its scope check passed, because
 * the file was a document, and documents are what a review may change.
 *
 * Changing and moving a document is a review's work; removing one is not.
 * A deleted path is a move when a file of the same name appears elsewhere
 * in the same unit, and a deletion otherwise.
 */
import { basename } from 'node:path';

/**
 * The documents a unit deletes outright, from `git diff --name-status
 * --no-renames` lines (`D\tpath`, `A\tpath`, `M\tpath`).
 */
export const deletedDocuments = (
	nameStatus: readonly string[],
	docsDir: string,
): readonly string[] => {
	const under = `${docsDir.replace(/\/+$/u, '')}/`;
	const entries = nameStatus
		.map((line) => line.split('\t'))
		.filter(
			(parts): parts is [string, string] =>
				parts.length === 2 &&
				parts[1] !== undefined &&
				parts[1].startsWith(under),
		);
	const added = new Set(
		entries
			.filter(([status]) => status === 'A')
			.map(([, path]) => basename(path)),
	);
	return entries
		.filter(
			([status, path]) => status === 'D' && !added.has(basename(path)),
		)
		.map(([, path]) => path);
};
