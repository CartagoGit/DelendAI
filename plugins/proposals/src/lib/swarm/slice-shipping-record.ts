/**
 * slice-shipping-record.ts — f00505 S5.
 *
 * Writing down which commit delivered a slice, at the moment the slice
 * is closed.
 *
 * The measurement that forced this: across the whole corpus, 1,445
 * slices in 599 proposals, only 41 cite a commit — 2.8%, concentrated
 * in 13 proposals. The reconciler in S2 withholds a slice only at
 * confidence 0.95, which requires a citation, so with that coverage it
 * could withhold almost nothing. The bottleneck was never reading the
 * citations. It is that they barely exist, because nothing writes them
 * and people add them when they remember.
 *
 * The fix is upstream and small: the one moment when the delivering
 * commit is known for certain is the moment the slice closes. Recording
 * it there costs a line and makes every later question answerable —
 * which slices actually shipped, whether a `pending` slice is really
 * unstarted, whether an agent is about to reimplement finished work.
 *
 * ## The format is the one already in use
 *
 * A backticked hash on a `- shipped-in:` line, so the extractor from S4
 * reads it with no translation and a human reads it without being told
 * how. Inventing a new encoding here would mean two formats to parse and
 * a migration nobody asked for.
 *
 * ## Closing without a known commit says so
 *
 * The tempting alternative is to omit the line. That produces a slice
 * indistinguishable from one closed before this existed, and quietly
 * loses the very signal the record was added for. An explicit "not
 * recorded" is a fact someone can act on; a missing line is an absence
 * nobody can interpret.
 */

/** A 7-40 character hex string, the shape git short and full SHAs take. */
const COMMIT_HASH_RE = /^[0-9a-f]{7,40}$/iu;

export const SHIPPING_LINE_PREFIX = '- shipped-in:';

/** Matches a shipping line already present, with or without a hash. */
const SHIPPING_LINE_RE = /^[-*]\s*shipped-in:\s*(.*)$/mu;

export const isCommitHash = (candidate: string): boolean =>
	COMMIT_HASH_RE.test(candidate.trim());

/**
 * The line to write for a close.
 *
 * `undefined` is not an error: a slice can legitimately close without a
 * commit (documentation reconciled in place, work already landed under
 * someone else's commit). It just has to say that rather than stay
 * silent.
 */
export const renderShippingLine = (commitHash?: string): string => {
	const trimmed = commitHash?.trim() ?? '';
	if (trimmed === '') {
		return `${SHIPPING_LINE_PREFIX} not recorded (closed without a known delivering commit)`;
	}
	if (!isCommitHash(trimmed)) {
		return `${SHIPPING_LINE_PREFIX} not recorded (${trimmed} is not a commit hash)`;
	}
	return `${SHIPPING_LINE_PREFIX} \`${trimmed.toLowerCase()}\``;
};

export interface IShippingRecordResult {
	readonly block: string;
	/** False when the block already had a record and was left alone. */
	readonly written: boolean;
	readonly reason: string;
}

/**
 * Add the shipping record to a slice block.
 *
 * Idempotent where it matters and only where it matters. A block that
 * already names a commit is returned untouched: closing twice — a retry,
 * a replayed event, an operator repeating a command — must not stack two
 * hashes that could then disagree about which one delivered the work.
 *
 * A block whose record says `not recorded` is a different case, and
 * treating it like the first was a real defect. That marker means the
 * slice closed without anyone knowing the delivering commit, which is
 * exactly the gap this module exists to close; refusing to fill it in
 * later would make the marker permanent and leave the corpus — the whole
 * point of the slice — smaller than it needs to be. So a known hash
 * replaces an unrecorded marker, and nothing else is ever overwritten.
 */
export const recordShippingCommit = (
	block: string,
	commitHash?: string,
): IShippingRecordResult => {
	const existing = SHIPPING_LINE_RE.exec(block);
	const line = renderShippingLine(commitHash);

	if (existing !== null) {
		const recorded = (existing[1] ?? '').trim();
		const alreadyNamesACommit = readShippingCommit(block) !== undefined;
		const nowKnowsOne = readShippingCommit(line) !== undefined;

		if (alreadyNamesACommit || !nowKnowsOne) {
			return {
				block,
				written: false,
				reason: alreadyNamesACommit
					? `the slice already names the commit that delivered it (${recorded}); a second close must not stack a line that could disagree with the first`
					: `the slice already records that no delivering commit was known, and this close does not know one either`,
			};
		}

		return {
			block: block.replace(SHIPPING_LINE_RE, line),
			written: true,
			reason: `the slice had closed without a known delivering commit; ${recorded} is now replaced by the hash that delivered it`,
		};
	}

	// Appended after the block's existing metadata, keeping the trailing
	// shape of the block intact so a re-read parses the same way.
	const trimmedEnd = block.replace(/\s+$/u, '');
	const trailing = block.slice(trimmedEnd.length);
	return {
		block: `${trimmedEnd}\n${line}${trailing === '' ? '\n' : trailing}`,
		written: true,
		reason: line.includes('not recorded')
			? 'recorded that no delivering commit was known, which is a fact rather than an absence'
			: 'recorded the delivering commit in the citation format the extractor already reads',
	};
};

/** The hash a block records, if it records a usable one. */
export const readShippingCommit = (block: string): string | undefined => {
	const match = SHIPPING_LINE_RE.exec(block);
	if (match === null) return undefined;
	const value = (match[1] ?? '').trim();
	const hash = /`([0-9a-f]{7,40})`/iu.exec(value)?.[1];
	return hash?.toLowerCase();
};
