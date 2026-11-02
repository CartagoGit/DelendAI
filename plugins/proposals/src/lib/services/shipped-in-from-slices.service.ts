/**
 * shipped-in-from-slices.service.ts — what delivered a proposal, read from
 * its slices when the frontmatter does not repeat it.
 */
import { listShippedIn, withShippedIn } from './review-attribution';

/** A commit as a slice writes it: seven hex digits or more. */
const COMMIT_NAMED = /\b[0-9a-f]{7,}\b/giu;

/**
 * The frontmatter with the commits its slices record as what delivered
 * them, when it names none itself; unchanged otherwise. A proposal whose
 * every slice says `- shipped-in: <sha>` was refused its close for a
 * field at the top that repeats them, and nothing wrote it for approvals
 * made before an approval did.
 */
export const withShippedInFromSlices = (markdown: string): string => {
	if (listShippedIn(markdown).length > 0) return markdown;
	const body = markdown.replace(/^---[\s\S]*?---\s*/u, '');
	const commits = [
		...new Set(
			[...body.matchAll(/^[-*]\s*shipped-in:\s*(.+)$/gimu)].flatMap(
				(line) => (line[1] ?? '').match(COMMIT_NAMED) ?? [],
			),
		),
	];
	return commits.reduce(
		(text, commit) => withShippedIn(text, commit),
		markdown,
	);
};
