/**
 * rehearsal-expectation.service.ts — what each expectation of a scenario
 * means on the forge's evidence: one judge per kind, found by the kind
 * itself. Pure over the evidence.
 */
import { REHEARSAL_CI_CHECK } from '../contracts/constants/rehearsal.constant';
import type {
	IRehearsalEvidence,
	IRehearsalExpectation,
	IRehearsalExpectationResult,
	IRehearsalPullEvent,
	IRehearsalPullState,
	IRehearsalRun,
} from '../contracts/interfaces/rehearsal.interface';

const SHORT_SHA = 12;

const VERDICT_LABELS = ['needs-update', 'culprit'] as const;

const verdictOf = (label: string | undefined): string | undefined =>
	VERDICT_LABELS.find((name) => label?.endsWith(name) === true);

/**
 * Times a verdict label was removed and put back with no new commit in
 * between: the flip that hid `needs-update` from the host (F3).
 */
export const labelFlips = (
	events: readonly IRehearsalPullEvent[],
): readonly string[] => {
	const removedSinceCommit = new Set<string>();
	const flips: string[] = [];
	for (const event of events) {
		if (event.event === 'committed') {
			removedSinceCommit.clear();
			continue;
		}
		const label = verdictOf(event.label);
		if (label === undefined) continue;
		if (event.event === 'unlabeled') removedSinceCommit.add(label);
		if (event.event === 'labeled' && removedSinceCommit.has(label)) {
			flips.push(`${label} removed and re-applied at ${event.createdAt}`);
			removedSinceCommit.delete(label);
		}
	}
	return flips;
};

const isCiRun = (run: IRehearsalRun): boolean =>
	run.workflow === REHEARSAL_CI_CHECK;

/** Whether the forge built a head: a CI run exists for it and was not held for approval. */
export const headBuilt = (
	runs: readonly IRehearsalRun[],
	sha: string,
): boolean =>
	runs.some(
		(run) =>
			isCiRun(run) &&
			run.headSha === sha &&
			run.conclusion !== 'action_required' &&
			run.status !== 'action_required',
	);

export const result = (
	expectation: string,
	ok: boolean,
	detail: string,
): IRehearsalExpectationResult => ({ expectation, ok, detail });

const pullOf =
	(evidence: IRehearsalEvidence) =>
	(key: string): IRehearsalPullState | undefined =>
		evidence.pulls[key];

type TJudges = {
	readonly [K in IRehearsalExpectation['kind']]: (
		evidence: IRehearsalEvidence,
		expectation: Extract<IRehearsalExpectation, { kind: K }>,
	) => IRehearsalExpectationResult;
};

const JUDGES: TJudges = {
	merged: (evidence, expectation) => {
		const pull = pullOf(evidence);

		const missing = expectation.keys.filter(
			(key) => pull(key)?.mergedAt === undefined,
		);
		return result(
			`merged: ${expectation.keys.join(', ')}`,
			missing.length === 0,
			missing.length === 0
				? 'all merged'
				: `not merged: ${missing.join(', ')}`,
		);
	},
	'not-merged': (evidence, expectation) => {
		const pull = pullOf(evidence);

		const merged = expectation.keys.filter(
			(key) => pull(key)?.mergedAt !== undefined,
		);
		return result(
			`not merged: ${expectation.keys.join(', ')}`,
			merged.length === 0,
			merged.length === 0
				? 'none merged'
				: `merged: ${merged.join(', ')}`,
		);
	},
	labelled: (evidence, expectation) => {
		const _pull = pullOf(evidence);

		const labelled = (evidence.events[expectation.key] ?? []).some(
			(event) =>
				event.event === 'labeled' &&
				verdictOf(event.label) === expectation.label,
		);
		return result(
			`${expectation.key} labelled ${expectation.label}`,
			labelled,
			labelled ? 'labelled' : 'never labelled',
		);
	},
	'labels-stable': (evidence, expectation) => {
		const _pull = pullOf(evidence);

		const flips = labelFlips(evidence.events[expectation.key] ?? []);
		return result(
			`${expectation.key} labels stable`,
			flips.length === 0,
			flips.length === 0 ? 'no flip' : flips.join('; '),
		);
	},
	'heads-built': (evidence, expectation) => {
		const pull = pullOf(evidence);

		const heads = [
			...(evidence.tokenHeads[expectation.key] ?? []),
			...(pull(`${expectation.key}:token-open`) === undefined
				? []
				: [pull(`${expectation.key}:token-open`)?.headSha ?? '']),
		];
		const unbuilt = heads.filter((sha) => !headBuilt(evidence.runs, sha));
		return result(
			`${expectation.key} heads built`,
			heads.length > 0 && unbuilt.length === 0,
			heads.length === 0
				? 'no head was written with the workflow token'
				: unbuilt.length === 0
					? `${String(heads.length)} head(s) built`
					: `no CI started for ${unbuilt.map((sha) => sha.slice(0, SHORT_SHA)).join(', ')}`,
		);
	},
	'group-ci-runs': (evidence, expectation) => {
		const pull = pullOf(evidence);

		const members = new Set(
			expectation.keys.map((key) => pull(key)?.head).filter(Boolean),
		);
		const memberRuns = evidence.runs.filter(
			(run) =>
				isCiRun(run) &&
				run.event === 'pull_request' &&
				members.has(run.headBranch),
		);
		const firstRuns = new Set(
			[...members].map(
				(head) =>
					memberRuns
						.filter((run) => run.headBranch === head)
						.sort((a, b) => a.createdAt.localeCompare(b.createdAt))
						.at(0)?.id,
			),
		);
		const groupRuns = evidence.runs.filter(
			(run) =>
				isCiRun(run) &&
				run.event === 'pull_request' &&
				!firstRuns.has(run.id) &&
				run.headBranch !== evidence.integration,
		);
		return result(
			`one CI for the group ${expectation.keys.join('+')}`,
			groupRuns.length === expectation.exactly,
			`${String(groupRuns.length)} CI run(s) after the members' own`,
		);
	},
	'tips-built': (evidence, _expectation) => {
		const _pull = pullOf(evidence);

		const merged = evidence.tips.slice(1);
		const unscanned = merged.filter(
			(sha) =>
				!evidence.runs.some(
					(run) =>
						run.event === 'push' &&
						run.headSha === sha &&
						run.workflow === 'rehearsal-scan',
				),
		);
		return result(
			'every integration tip started its push workflows',
			merged.length > 0 && unscanned.length === 0,
			merged.length === 0
				? 'the integration branch never moved'
				: unscanned.length === 0
					? `${String(merged.length)} tip(s) scanned`
					: `no push run for ${unscanned.map((sha) => sha.slice(0, SHORT_SHA)).join(', ')}`,
		);
	},
	'no-manual-steps': (evidence, _expectation) => {
		const _pull = pullOf(evidence);
		return result(
			'no manual step',
			evidence.manualSteps.length === 0,
			evidence.manualSteps.length === 0
				? 'none'
				: evidence.manualSteps.join('; '),
		);
	},
	'sessions-notified': (evidence, _expectation) => {
		const _pull = pullOf(evidence);
		return result(
			'sessions notified',
			evidence.notifications !== undefined &&
				evidence.notifications.length > 0,
			evidence.notifications === undefined
				? 'no session receiver ran: nobody was told'
				: `${String(evidence.notifications.length)} notification(s)`,
		);
	},
};

/** The verdict of one expectation on one scenario's evidence. */
export const judge = (
	evidence: IRehearsalEvidence,
	expectation: IRehearsalExpectation,
): IRehearsalExpectationResult =>
	(
		JUDGES[expectation.kind] as (
			evidence: IRehearsalEvidence,
			expectation: IRehearsalExpectation,
		) => IRehearsalExpectationResult
	)(evidence, expectation);
