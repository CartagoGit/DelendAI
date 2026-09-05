/**
 * slice-cited-commits.ts — f00505 S4.
 *
 * The commits a proposal cites as having shipped each slice.
 *
 * This is the evidence `reconcile-before-dispatch` cannot act without.
 * Its rule withholds a slice only at confidence 0.95, and the evaluator
 * awards 0.95 only when the declared files are tracked AND a commit is
 * cited. Without the citations the verdict caps at 0.75, so the
 * reconciler would run, never withhold anything, and cost maintenance
 * while providing a guarantee it could not keep. That is why this had to
 * come first.
 *
 * An extractor already exists in `tools/scripts/lint/`, but it lives in
 * the repo's own tooling and a plugin must not depend on that — the
 * plugin ships to other projects and `tools/` does not. The rules are
 * duplicated here deliberately and narrowly: backticked hex, minus the
 * two things in this repo that look like hashes and are not.
 *
 * ## Why citations are read per slice, not per proposal
 *
 * A proposal cites commits all over itself: in its narrative, in a
 * rationale, in a note about some other slice. Attributing every hash in
 * the document to every slice would let one shipped slice vouch for its
 * unstarted neighbours — and since a citation is half of what licenses
 * withholding, that mistake withholds real work. So a hash counts for a
 * slice only when it appears inside that slice's own block.
 */

/** Backticked 7-40 char hex, the convention this repo already uses. */
const BACKTICKED_HASH_RE = /`([0-9a-f]{7,40})`/giu;

/**
 * A proposal id like `f00505a` is hex-adjacent and never a commit.
 * A CI run id is a long run of digits, which is also valid hex.
 */
const PROPOSAL_ID_RE = /^[a-z]\d{5}[a-z]$/iu;
const CI_RUN_ID_RE = /^\d{9,}$/u;

const isCommitHash = (candidate: string): boolean =>
	!PROPOSAL_ID_RE.test(candidate) && !CI_RUN_ID_RE.test(candidate);

/** Every commit hash cited in one block of markdown, deduped and lowercased. */
export const extractSliceCommits = (block: string): readonly string[] => {
	const found = new Set<string>();
	for (const match of block.matchAll(BACKTICKED_HASH_RE)) {
		const hash = match[1]?.toLowerCase();
		if (hash !== undefined && isCommitHash(hash)) found.add(hash);
	}
	return [...found];
};

export interface ISliceCitations {
	readonly sliceId: string;
	readonly citedCommits: readonly string[];
}

/** `### S1 — title` … up to the next `###` or a top-level `##`. */
const SLICE_HEADING_RE = /^###\s+(S\d+[a-z]?)\b/iu;
const SECTION_END_RE = /^##(?!#)/u;

/**
 * Split a proposal into slice blocks and read each one's citations.
 *
 * Content before the first slice heading belongs to no slice and is
 * dropped, which is the point: the proposal's narrative routinely cites
 * the commit that created the proposal itself, and letting that count
 * would mark every slice as shipped on day one.
 */
export const citationsBySlice = (
	markdown: string,
): readonly ISliceCitations[] => {
	// Frontmatter can carry recan notes full of hashes that describe the
	// proposal's history rather than any slice's delivery.
	const body = markdown.replace(/^---[\s\S]*?\n---\s*/u, '');
	const lines = body.split('\n');

	const out: ISliceCitations[] = [];
	let currentSlice: string | undefined;
	let buffer: string[] = [];

	const flush = (): void => {
		if (currentSlice === undefined) return;
		out.push({
			sliceId: currentSlice,
			citedCommits: extractSliceCommits(buffer.join('\n')),
		});
	};

	for (const line of lines) {
		const heading = SLICE_HEADING_RE.exec(line);
		if (heading !== null) {
			flush();
			currentSlice = heading[1]?.toUpperCase();
			buffer = [];
			continue;
		}
		if (currentSlice !== undefined && SECTION_END_RE.test(line)) {
			// A new top-level section ends the slice list; anything after
			// it (acceptance, notes, risks) is about the proposal.
			flush();
			currentSlice = undefined;
			buffer = [];
			continue;
		}
		if (currentSlice !== undefined) buffer.push(line);
	}
	flush();

	return out;
};

/** The citations for one slice, or an empty list when it has none. */
export const citedCommitsForSlice = (
	markdown: string,
	sliceId: string,
): readonly string[] =>
	citationsBySlice(markdown).find(
		(entry) => entry.sliceId.toUpperCase() === sliceId.toUpperCase(),
	)?.citedCommits ?? [];
