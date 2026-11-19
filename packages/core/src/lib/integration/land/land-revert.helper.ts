/**
 * land-revert.helper.ts — a red integration-branch run with a culprit is
 * repaired by reverting the culprit's merge, through land, by no hand.
 *
 * ONE revert pull request is opened per culprit (`git revert -m 1`, built
 * in a throwaway index by the git port, never in a checkout), labelled
 * `delendai:repair` and admitted ahead of every other candidate. It merges
 * only when its own run turns the culprit's failures green and adds none.
 * The original work is labelled `delendai:needs-update` with the failing
 * specs named, so it is re-opened. A revert that conflicts is reported as
 * needing a person and nothing is pushed. Run twice, a pass opens no second.
 */
import { groupByOverlap } from '../decisions/overlap.helper';
import type { IChangeFootprint } from '../decisions/overlap.interface';

import { LAND_LABEL_NEEDS_UPDATE, LAND_LABEL_REPAIR } from './land.constant';
import type {
	IDevelopMerge,
	ILandCheck,
	ILandForge,
	ILandPullRequest,
} from './land.interface';
import type {
	ILandRepairOutcome,
	ILandRepairRecord,
	ILandRepairVerdict,
	ILandRevertGit,
} from './land-revert.interface';

const RECORD_PREFIX = 'land-repair: ';

export const repairBranch = (prefix: string, culprit: number): string =>
	`${prefix}revert-${String(culprit)}`;

export const repairBody = (record: ILandRepairRecord): string =>
	`Reverts the merge of #${String(record.culprit)}, which turned the integration branch red.\n\n${RECORD_PREFIX}${JSON.stringify(record)}`;

/** The record a repair pull request carries, `undefined` for any other. */
export const readRepairRecord = (
	body: string,
): ILandRepairRecord | undefined => {
	const line = body
		.split('\n')
		.find((text) => text.startsWith(RECORD_PREFIX));
	if (line === undefined) return undefined;
	try {
		const parsed = JSON.parse(
			line.slice(RECORD_PREFIX.length),
		) as Partial<ILandRepairRecord>;
		return typeof parsed.culprit === 'number' &&
			Array.isArray(parsed.failing) &&
			Array.isArray(parsed.known)
			? {
					culprit: parsed.culprit,
					failing: parsed.failing,
					known: parsed.known,
				}
			: undefined;
	} catch {
		return undefined;
	}
};

/** Repairs go before every other candidate; the rest keep their order. */
export const repairsFirst = <T extends { readonly pr: ILandPullRequest }>(
	candidates: readonly T[],
): T[] => {
	const isRepair = (c: T): number =>
		c.pr.labels.includes(LAND_LABEL_REPAIR) ? 0 : 1;
	return [...candidates].sort(
		(a, b) => isRepair(a) - isRepair(b) || a.pr.number - b.pr.number,
	);
};

const FAILED = new Set(['failure', 'timed_out']);

/** What a failed check is known by: the specs it names, else its own name. */
export const failureIds = (check: ILandCheck): readonly string[] =>
	check.failingSpecs !== undefined && check.failingSpecs.length > 0
		? check.failingSpecs
		: [check.name];

/** The ids a red run's failed checks are known by. */
export const failedIds = (checks: readonly ILandCheck[]): string[] => [
	...new Set(
		checks
			.filter((check) => FAILED.has(check.conclusion ?? ''))
			.flatMap(failureIds),
	),
];

/**
 * Whether a repair's own run may merge: its checks are all in, none of the
 * culprit's failing specs still fails, and no failure is new.
 */
export const judgeRepair = (
	record: ILandRepairRecord,
	checks: readonly ILandCheck[],
): ILandRepairVerdict => {
	if (checks.some((check) => check.conclusion === null))
		return { kind: 'wait' };
	const failed = checks.filter((check) => FAILED.has(check.conclusion ?? ''));
	const stillFailing = new Set(failed.flatMap(failureIds));
	const left = record.failing.filter((spec) => stillFailing.has(spec));
	if (left.length > 0)
		return {
			kind: 'reject',
			why: `the culprit's failures are still red: ${left.join(', ')}`,
		};
	const known = new Set(record.known);
	const added = [...stillFailing].filter((spec) => !known.has(spec));
	if (added.length > 0)
		return {
			kind: 'reject',
			why: `the revert adds failures: ${added.join(', ')}`,
		};
	return { kind: 'merge' };
};

const sayOnce = async (
	forge: ILandForge,
	number: number,
	marker: string,
	text: string,
): Promise<void> => {
	const said = (await forge.comments(number)).some((c) => c.includes(marker));
	if (!said) await forge.comment(number, `${text}\n${marker}`);
};

/** Re-open the original work: needs-update, the failing specs named. */
const reopenWork = async (
	forge: ILandForge,
	record: ILandRepairRecord,
	revert: number,
): Promise<void> => {
	const original = await forge.pullRequest(record.culprit);
	if (!original.labels.includes(LAND_LABEL_NEEDS_UPDATE))
		await forge.addLabel(record.culprit, LAND_LABEL_NEEDS_UPDATE);
	await sayOnce(
		forge,
		record.culprit,
		`<!-- land:repair@${String(record.culprit)} -->`,
		`land: this merge turned the integration branch red and was reverted by #${String(revert)}. Failing specs: ${record.failing.join(', ') || '(none named)'}. Fix them and push again; land picks it up.`,
	);
};

/** Open the one revert of the culprit, or say why it did not. */
export const openRepair = async (input: {
	readonly forge: ILandForge;
	readonly git: ILandRevertGit;
	readonly tip: string;
	readonly repairPrefix: string;
	readonly merge: IDevelopMerge;
	readonly failing: readonly string[];
	readonly known: readonly string[];
	readonly note: (line: string) => void;
}): Promise<ILandRepairOutcome> => {
	const { forge, git, merge, note } = input;
	const ref = repairBranch(input.repairPrefix, merge.number);
	const open = (await forge.openPullRequests()).find(
		(pr) => pr.headRef === ref,
	);
	if (open !== undefined) return { kind: 'exists', number: open.number };
	const built = git.revertMerge({ ref, tip: input.tip, merge });
	if (built.kind === 'conflict') {
		const reason = `reverting #${String(merge.number)} conflicts: a person must repair it`;
		await sayOnce(
			forge,
			merge.number,
			`<!-- land:repair-conflict@${String(merge.number)} -->`,
			`land: ${reason}.`,
		);
		note(reason);
		return { kind: 'needs-person', reason };
	}
	if (built.kind === 'failed') {
		note(`revert of #${String(merge.number)} failed: ${built.reason}`);
		return { kind: 'needs-person', reason: built.reason };
	}
	const record: ILandRepairRecord = {
		culprit: merge.number,
		failing: [...input.failing],
		known: [...input.known],
	};
	const number = await forge.openPullRequest({
		head: ref,
		title: `Revert #${String(merge.number)}: it turned the integration branch red`,
		body: repairBody(record),
	});
	await forge.addLabel(number, LAND_LABEL_REPAIR);
	note(`#${String(number)} reverts #${String(merge.number)} as a repair`);
	await reopenWork(forge, record, number);
	return { kind: 'opened', number };
};

/**
 * Why `pr` cannot land yet, `undefined` when it can. A repair is judged on
 * its own run (the culprit's failures green, none added), even where the
 * branch's other failures keep a check red; anything else by `notReady`.
 */
export const repairReadiness = (
	pr: ILandPullRequest,
	checks: readonly ILandCheck[],
	notReady: (
		pr: ILandPullRequest,
		checks: readonly ILandCheck[],
	) => string | undefined,
): string | undefined => {
	const record = pr.labels.includes(LAND_LABEL_REPAIR)
		? readRepairRecord(pr.body)
		: undefined;
	if (record === undefined) return notReady(pr, checks);
	const verdict = judgeRepair(record, checks);
	if (verdict.kind === 'wait') return 'a repair waiting for its run';
	if (verdict.kind === 'reject')
		return `a repair that does not repair: ${verdict.why}`;
	return pr.draft ? 'draft' : undefined;
};

/** Group the candidates by overlap; a repair is admitted ahead of every other: its groups settle first. */
export const settleRepairsFirst = async <
	C extends { readonly pr: ILandPullRequest; readonly own: IChangeFootprint },
>(
	candidates: readonly C[],
	settle: (group: readonly C[]) => Promise<void>,
): Promise<void> => {
	const groups = groupByOverlap(repairsFirst(candidates));
	const hasRepair = (g: readonly C[]): boolean =>
		g.some(({ pr }) => pr.labels.includes(LAND_LABEL_REPAIR));
	await Promise.all(groups.filter(hasRepair).map(settle));
	await Promise.all(groups.filter((g) => !hasRepair(g)).map(settle));
};
