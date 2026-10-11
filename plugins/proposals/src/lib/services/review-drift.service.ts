/**
 * review-drift.service.ts — how old a review is, and how far the repository
 * moved under it since its work landed (f00640).
 *
 * A review of work that landed 250 commits ago, under files rewritten since,
 * is a different job from one that landed an hour ago. The measure is pure
 * over git facts; `lint:proposal-ready-to-close` reports it, and the review
 * queue orders by it, so reviews that grow more expensive with every merge
 * come first.
 */
import type {
	IReviewDrift,
	IReviewGitFacts,
} from '../contracts/interfaces/review-drift.interface';
import type { IReviewQueueProposal } from '../contracts/interfaces/review-queue.interface';
import type { IGitRunner } from '../shared/git-runner';

/** Milliseconds in a day, for the age of a review. */
const DAY_MS = 86_400_000;

/**
 * Age and drift of a review, from the latest `shipped-in` commit git
 * knows. A review of work that landed long ago, under files rewritten
 * since, is a different job from one that landed minutes ago; this is
 * what tells them apart. Never "fresh" when it cannot be measured.
 */
export const measureReviewDrift = (input: {
	readonly shippedIn: readonly string[];
	readonly files: readonly string[];
	readonly nowMs: number;
	readonly git: IReviewGitFacts;
}): IReviewDrift => {
	const landed = input.shippedIn
		.map((sha) => ({ sha, at: input.git.commitTimeMs(sha) }))
		.filter((c): c is { sha: string; at: number } => c.at !== undefined)
		.sort((a, b) => b.at - a.at)[0];
	if (landed === undefined) {
		return {
			measured: false,
			reason: 'no shipped-in commit is known to this clone',
		};
	}
	const touched = [...input.git.filesTouchedSince(landed.sha, input.files)];
	return {
		measured: true,
		reviewAgeDays: Math.floor((input.nowMs - landed.at) / DAY_MS),
		commitsSince: input.git.commitsSince(landed.sha),
		filesTouchedSince: touched,
		files: input.files.length,
		driftRatio:
			input.files.length === 0 ? 0 : touched.length / input.files.length,
	};
};

/** Largest drift first, then oldest; unmeasurable last. */
export const byDrift = (a: IReviewDrift, b: IReviewDrift): number => {
	if (!a.measured || !b.measured) {
		return Number(!a.measured) - Number(!b.measured);
	}
	return (
		b.driftRatio - a.driftRatio ||
		b.commitsSince - a.commitsSince ||
		b.reviewAgeDays - a.reviewAgeDays
	);
};

/**
 * The git facts for these commits and files, read once with the async
 * runner so the pure measure can ask them synchronously.
 */
const preloadFacts = async (
	run: IGitRunner,
	integration: string,
	shas: readonly string[],
	files: readonly string[],
): Promise<IReviewGitFacts> => {
	const time = new Map<string, number>();
	const since = new Map<string, number>();
	const touched = new Map<string, readonly string[]>();
	for (const sha of shas) {
		const at = await run(['show', '-s', '--format=%ct', sha]);
		const seconds = Number(at.ok ? at.output.trim() : Number.NaN);
		if (!Number.isFinite(seconds)) continue;
		time.set(sha, seconds * 1000);
		const count = await run([
			'rev-list',
			'--count',
			`${sha}..${integration}`,
		]);
		since.set(sha, Number(count.ok ? count.output.trim() : 0) || 0);
		const changed =
			files.length === 0
				? undefined
				: await run([
						'log',
						'--format=',
						'--name-only',
						`${sha}..${integration}`,
						'--',
						...files,
					]);
		const seen = new Set(
			(changed?.ok === true ? changed.output : '')
				.split('\n')
				.map((line) => line.trim())
				.filter((line) => line.length > 0),
		);
		touched.set(
			sha,
			files.filter(
				(file) =>
					seen.has(file) ||
					[...seen].some((path) => path.startsWith(`${file}/`)),
			),
		);
	}
	return {
		commitTimeMs: (sha) => time.get(sha),
		commitsSince: (sha) => since.get(sha) ?? 0,
		filesTouchedSince: (sha) => touched.get(sha) ?? [],
	};
};

/**
 * Each proposal with its drift, largest first: measured from the commits
 * its slices were delivered by and the files they declare.
 */
export const orderByDrift = async (
	proposals: readonly IReviewQueueProposal[],
	run: IGitRunner,
	integration: string,
	nowMs: number = Date.now(),
): Promise<readonly IReviewQueueProposal[]> => {
	const measured: IReviewQueueProposal[] = [];
	for (const proposal of proposals) {
		const shippedIn = [
			...new Set(
				proposal.slices.flatMap((slice) =>
					slice.candidates.length === 0
						? []
						: [slice.candidates[0]?.commit ?? ''],
				),
			),
		].filter((sha) => sha.length > 0);
		const files = [
			...new Set(proposal.slices.flatMap((slice) => slice.files)),
		];
		const drift = measureReviewDrift({
			shippedIn,
			files,
			nowMs,
			git: await preloadFacts(run, integration, shippedIn, files),
		});
		measured.push({ ...proposal, drift });
	}
	return measured
		.map((proposal, index) => ({ proposal, index }))
		.sort(
			(a, b) =>
				byDrift(
					a.proposal.drift ?? { measured: false, reason: '' },
					b.proposal.drift ?? { measured: false, reason: '' },
				) || a.index - b.index,
		)
		.map(({ proposal }) => proposal);
};
