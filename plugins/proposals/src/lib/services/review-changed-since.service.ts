/**
 * review-changed-since.service.ts — what the integration branch did to a
 * slice's files after the slice was delivered (x00661).
 */
import type { IBuildReviewQueueInput } from '../contracts/interfaces/review-queue.interface';

/** The most later commits named per slice. */
const CHANGED_SINCE_LIMIT = 10;

/**
 * What the integration branch did to a slice's files after the slice was
 * delivered. Reviewed months later, a slice whose work a later proposal
 * changed or reverted looked incomplete against today's code; it was
 * not. Globs are passed as git glob pathspecs.
 */
const changedSince = async (
	input: IBuildReviewQueueInput,
	commit: string | undefined,
	files: readonly string[],
): Promise<
	readonly { readonly commit: string; readonly subject: string }[]
> => {
	if (commit === undefined || files.length === 0) return [];
	const specs = files.map((file) =>
		file.includes('*') ? `:(glob)${file}` : file,
	);
	const log = await input.run([
		'log',
		'--no-merges',
		// One more than is kept, to know whether there were more.
		`--max-count=${String(CHANGED_SINCE_LIMIT + 1)}`,
		'--format=%h%x09%s',
		`${commit}..${input.integration}`,
		'--',
		...specs,
	]);
	if (!log.ok) return [];
	return log.output
		.split('\n')
		.map((line) => line.split('\t'))
		.filter(([sha]) => sha !== undefined && sha.length > 0)
		.map(([sha, ...subject]) => ({
			commit: sha ?? '',
			subject: subject.join('\t'),
		}));
};

/**
 * The slice fields `changedSince` contributes: the newest later commits,
 * and whether there were more than it lists. A reviewer told "these
 * changed it" must know when the list is not the whole of it.
 */
export const changedSinceFields = async (
	input: IBuildReviewQueueInput,
	commit: string | undefined,
	files: readonly string[],
): Promise<{
	readonly changedSince?: readonly {
		readonly commit: string;
		readonly subject: string;
	}[];
	readonly changedSinceTruncated?: boolean;
}> => {
	const later = await changedSince(input, commit, files);
	if (later.length === 0) return {};
	return {
		changedSince: later.slice(0, CHANGED_SINCE_LIMIT),
		...(later.length > CHANGED_SINCE_LIMIT
			? { changedSinceTruncated: true }
			: {}),
	};
};
