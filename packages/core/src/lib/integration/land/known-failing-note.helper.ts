/**
 * known-failing-note.helper.ts — the integration branch's known-failing
 * specs travel as git data: one note per commit, on a notes ref under the
 * product's namespace, so a proof reads them offline after a fetch.
 *
 * Writer side (land's repair pass): the red run's failing spec ids are the
 * note of its commit; a green run writes an empty set. Reader side (the
 * proof): the note of the base commit, else of its nearest first-parent
 * ancestor that has one; no note means no subtraction.
 */
import { KNOWN_FAILING_SEARCH_DEPTH } from '../../contracts/constants/known-failing.constant';
import type {
	IKnownFailingGit,
	IKnownFailingNote,
} from '../../contracts/interfaces/known-failing.interface';

/** Notes refs must live under `refs/notes/`; the namespace keeps it the product's. */
export const knownFailingNotesRef = (namespace: string): string =>
	`refs/notes/${namespace === '' ? 'delendai' : namespace}/known-failing`;

/** The note a run's verdict becomes; `failingSpecs` empty (a green run) writes an empty set. */
export const knownFailingNoteOf = (input: {
	readonly namespace: string;
	readonly commit: string;
	readonly failingSpecs: Iterable<string>;
}): IKnownFailingNote => ({
	ref: knownFailingNotesRef(input.namespace),
	commit: input.commit,
	content: `${JSON.stringify([...new Set(input.failingSpecs)].sort())}\n`,
});

/** The spec ids a note holds; anything unreadable holds none. */
export const parseKnownFailingNote = (content: string): ReadonlySet<string> => {
	try {
		const parsed: unknown = JSON.parse(content);
		return new Set(
			Array.isArray(parsed)
				? parsed.filter((v): v is string => typeof v === 'string')
				: [],
		);
	} catch {
		return new Set();
	}
};

/**
 * The known-failing set for `base`: the note of the nearest first-parent
 * ancestor (itself included) that has one, or `undefined` when none does.
 * The notes ref is fetched first, best effort: offline keeps what is local.
 */
export const readKnownFailing = (
	git: IKnownFailingGit,
	input: {
		readonly namespace: string;
		readonly base: string;
		readonly remote: string;
	},
): ReadonlySet<string> | undefined => {
	const ref = knownFailingNotesRef(input.namespace);
	git(['fetch', '-q', input.remote, `+${ref}:${ref}`]);
	const chain = git([
		'rev-list',
		'--first-parent',
		`--max-count=${String(KNOWN_FAILING_SEARCH_DEPTH)}`,
		input.base,
	]);
	for (const commit of (chain ?? '').split('\n')) {
		if (commit.length === 0) continue;
		const note = git(['notes', `--ref=${ref}`, 'show', commit]);
		if (note !== undefined) return parseKnownFailingNote(note);
	}
	return undefined;
};
