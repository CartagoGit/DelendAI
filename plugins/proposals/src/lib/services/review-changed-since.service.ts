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
export const changedSince = async (
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
		`--max-count=${String(CHANGED_SINCE_LIMIT)}`,
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
