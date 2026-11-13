/**
 * land.ts — one stateless integration pass.
 *
 * It reads the forge, decides with the core decisions module, and acts
 * through the adapter; it keeps nothing. Everything a later pass needs is
 * on the forge: a batch pull request records its tip, members (with their
 * heads) and any verdict in its body, a culprit carries a label and a
 * comment. A pass that dies between two calls leaves a state the next pass
 * reads and finishes: every step checks what is already done.
 *
 * - A pull request with no overlap against what landed since its tested
 *   base merges, pinned to its head.
 * - Ready pull requests that overlap each other ride ONE batch pull
 *   request over the tip; green, its members merge in order, pinned, and
 *   the resulting tree is checked against the tested one. Red, the
 *   culprit is named and the rest are batched again once; the same set is
 *   never batched twice on the same tip.
 * - Groups that do not overlap proceed in parallel.
 * - Derived files that conflict are regenerated on the batch; authored
 *   code labels the pull request for its author.
 */
import { trainMembers } from '../decisions/culprit.helper';
import {
	groupByOverlap,
	overlapBetween,
	staleAgainstTip,
} from '../decisions/overlap.helper';
import type { IChangeFootprint } from '../decisions/overlap.interface';
import { whyNotReady } from '../decisions/readiness.helper';

import { openBatch as assembleBatch } from './land-batch-assembly.helper';
import { bringForwardUnbuilt, headNotBuilt } from './land-bring-forward.helper';
import {
	BatchMemory,
	readBatchRecord,
	setKey,
} from './land-batch-record.helper';
import { LAND_LABEL_CULPRIT, LAND_LABEL_NEEDS_UPDATE } from './land.constant';
import { mergeCertifiedBatch } from './land-batch-merge.helper';
import { needsUpdateComment, reconcileLabels } from './land-labels.helper';
import { closeRedBatch, markRedBatch } from './land-verdict.helper';
import type {
	ILandBatchRecord,
	ILandCheck,
	ILandConflict,
	ILandDeps,
	ILandPullRequest,
	ILandReport,
} from './land.interface';

const FAILED = new Set(['failure', 'timed_out']);

/** One pass. Never throws on a forge refusal: it reports and leaves it to the next. */
export const landPass = async (deps: ILandDeps): Promise<ILandReport> => {
	const { forge, git } = deps;
	const actions: string[] = [];
	const note = (line: string): void => {
		actions.push(line);
	};
	const mergedPRs: number[] = [];
	const reasons = new Map<number, string>();
	const why = (number: number, reason: string): void => {
		reasons.set(number, reason);
	};
	const landed = (number: number): void => {
		mergedPRs.push(number);
		why(number, 'merged');
	};
	const tip = await forge.integrationTip();
	const required =
		deps.config.requiredChecks.length > 0
			? deps.config.requiredChecks
			: await forge.requiredChecks();
	const batches = await forge.batchPullRequests(deps.config.batchPrefix);
	const recordOf = (pr: ILandPullRequest): ILandBatchRecord | undefined =>
		readBatchRecord(pr.body);

	/** Why `pr` cannot land on these checks, `undefined` when it can. */
	const notReady = (
		pr: ILandPullRequest,
		checks: readonly ILandCheck[],
	): string | undefined =>
		whyNotReady({
			draft: pr.draft,
			checks,
			required,
			withoutChecks: deps.config.withoutChecks,
			labels: pr.labels,
			blockingLabels: [],
			headAuthor: pr.headAuthor,
			unbuiltAuthors: deps.config.unbuiltAuthors,
		});

	const memory = new BatchMemory(tip);
	for (const batch of batches) {
		const record = recordOf(batch);
		if (record !== undefined) memory.remember(record);
	}
	const { culpritHeads, redSets, aloneOnTip } = memory;
	const remember = (record: ILandBatchRecord): void =>
		memory.remember(record);

	// Verdicts are collected while judging and applied once, at the end.
	const wanted = new Map<number, Map<string, string | undefined>>();
	const want = (
		number: number,
		label: string,
		comment: string | undefined,
	): void => {
		const own = wanted.get(number) ?? new Map<string, string | undefined>();
		own.set(label, comment);
		wanted.set(number, own);
	};
	const needsUpdate = (pr: ILandPullRequest, reason: string): void => {
		want(pr.number, LAND_LABEL_NEEDS_UPDATE, needsUpdateComment(reason));
	};

	const markRed = (
		batch: ILandPullRequest,
		record: ILandBatchRecord,
		checks: readonly ILandCheck[],
	): Promise<ILandBatchRecord> =>
		markRedBatch({ deps, batch, record, checks, note });

	const finishRed = (
		batch: ILandPullRequest,
		record: ILandBatchRecord,
		checks: readonly ILandCheck[],
	): Promise<void> => closeRedBatch(forge, batch, record, checks);

	/** Settle one open batch; true when it is still in flight (its members wait). */
	const settleBatch = async (batch: ILandPullRequest): Promise<boolean> => {
		const record = recordOf(batch);
		if (record === undefined) {
			await forge.closePullRequest(batch.number);
			note(`batch #${String(batch.number)} had no record: closed`);
			return false;
		}
		const checks = await forge.checks(batch.headSha);
		if (record.red !== undefined) {
			await finishRed(batch, record, checks);
			return false;
		}
		const members = await Promise.all(
			record.members.map(async (m) => ({
				recorded: m.sha,
				pr: await forge.pullRequest(m.number),
			})),
		);
		const open = members.filter(({ pr }) => pr.state === 'open');
		if (open.length === 0) {
			await forge.closePullRequest(batch.number);
			note(`batch #${String(batch.number)} is complete: closed`);
			return false;
		}
		const started = members.some(({ pr }) => pr.merged);
		const changed = open.some(
			({ pr, recorded }) => pr.headSha !== recorded,
		);
		// The branch moved: the batch stands when it moved only by sections
		// the batch does not reach (its members merge, the tree is checked).
		const moved =
			record.tip === tip
				? undefined
				: record.regenerated
					? 'the batch carries a regeneration of the old tip'
					: staleAgainstTip(
							git.landedSince(record.tip, batch.headSha),
							git.landedSince(record.tip, tip),
						);
		if (!started && (changed || moved !== undefined)) {
			await forge.closePullRequest(batch.number);
			note(
				`batch #${String(batch.number)} is stale${moved === undefined ? '' : ` (the integration branch moved in ${moved})`}: closed, rebuilt below`,
			);
			return false;
		}
		if (checks.some((c) => FAILED.has(c.conclusion ?? ''))) {
			const red = await markRed(batch, record, checks);
			remember(red);
			await finishRed(batch, red, checks);
			return false;
		}
		if (notReady(batch, checks) !== undefined) return true;
		const outcome = await mergeCertifiedBatch({
			deps,
			batch,
			record,
			open,
			note,
			landed,
		});
		if (outcome === 'in-flight') return true;
		await forge.closePullRequest(batch.number);
		return false;
	};

	const inFlight = new Set<number>();
	for (const batch of batches.filter((b) => b.state === 'open')) {
		const members = recordOf(batch)?.members ?? [];
		if (await settleBatch(batch)) {
			for (const m of members) inFlight.add(m.number);
		}
	}

	const aloneBusy = [...aloneOnTip].some((n) => inFlight.has(n));

	// The ready pull requests: green on their head, not a known culprit.
	const candidates: {
		pr: ILandPullRequest;
		own: IChangeFootprint;
		conflict: ILandConflict;
	}[] = [];
	const openNow = await forge.openPullRequests();
	for (const pr of openNow) {
		if (inFlight.has(pr.number)) {
			why(pr.number, 'rides a batch under test');
			continue;
		}
		if (culpritHeads.get(pr.number) === pr.headSha) {
			why(pr.number, 'the culprit of a red batch: waits for a new head');
			want(pr.number, LAND_LABEL_CULPRIT, undefined);
			continue;
		}
		const checks = await forge.checks(pr.headSha);
		const waits = notReady(pr, checks);
		if (waits !== undefined) {
			why(pr.number, waits);
			// A head the forge never builds never turns green by waiting: the
			// integrator brings it forward once, else its author is asked.
			if (headNotBuilt(pr, checks, deps.config.unbuiltAuthors)) {
				const forward = await bringForwardUnbuilt({ deps, pr, tip });
				if (forward === 'brought') {
					why(pr.number, 'brought forward: the new head is built');
					note(`#${String(pr.number)} brought forward to the tip`);
				} else if (pr.crossRepository === true) {
					why(
						pr.number,
						'a cross-repository head is never built or pushed by the integrator',
					);
				} else needsUpdate(pr, waits);
			}
			continue;
		}
		const conflict = git.conflictOf(pr, tip);
		if (conflict === 'authored') {
			why(
				pr.number,
				'needs update: it conflicts with the integration branch',
			);
			needsUpdate(pr, 'it conflicts with the integration branch');
			continue;
		}
		candidates.push({ pr, own: git.footprint(pr), conflict });
	}
	candidates.sort((a, b) => a.pr.number - b.pr.number);

	const openBatch = (
		members: readonly ILandPullRequest[],
		because: string,
	): Promise<void> =>
		assembleBatch({
			deps,
			tip,
			members,
			because,
			report: { why, note, needsUpdate },
		});

	const settleGroup = async (
		group: readonly {
			pr: ILandPullRequest;
			own: IChangeFootprint;
			conflict: ILandConflict;
		}[],
	): Promise<void> => {
		const [first] = group;
		if (first !== undefined && group.length === 1) {
			const { pr, own, conflict } = first;
			if (aloneOnTip.has(pr.number) && deps.config.batches) {
				why(pr.number, 'a suspect of a red batch, tested alone');
				return aloneBusy
					? undefined
					: openBatch([pr], 'a suspect, tested alone');
			}
			if (conflict === 'derived') {
				if (pr.crossRepository === true) {
					why(
						pr.number,
						'a cross-repository head is never built or pushed',
					);
					return;
				}
				if (deps.resolveDerived !== undefined) {
					// Two jobs, never this pass: the regeneration runs the
					// project's code, so it holds no token.
					const started = await deps.resolveDerived(pr);
					why(
						pr.number,
						started
							? 'its derived files conflict: resolved by the derived jobs'
							: 'its derived files conflict: the derived jobs were not started',
					);
					return;
				}
				if (deps.config.batches)
					return openBatch([pr], 'derived files to regenerate');
				// Land pushes nothing the forge will not build: the author's
				// side regenerates them.
				why(pr.number, 'needs update: its derived files conflict');
				return needsUpdate(
					pr,
					'its derived files conflict with the integration branch',
				);
			}
			const gained =
				pr.testedBase === tip
					? undefined
					: git.landedSince(pr.testedBase, tip);
			if (
				gained !== undefined &&
				overlapBetween(own, gained) !== undefined
			) {
				// Never through the forge: an update made with the workflow
				// token is a head nothing builds, and the pull request would
				// wait for checks that never come.
				const reason =
					'the integration branch changed what it touches since its checks ran';
				why(pr.number, `needs update: ${reason}`);
				return needsUpdate(pr, reason);
			}
			const merged = await forge.merge(pr.number, pr.headSha);
			if (merged === 'merged') landed(pr.number);
			else why(pr.number, `not merged (${merged}): next pass`);
			note(
				merged === 'merged'
					? `#${String(pr.number)} merged at ${pr.headSha.slice(0, 12)}`
					: `#${String(pr.number)} not merged (${merged}): next pass`,
			);
			return;
		}
		if (!deps.config.batches && first !== undefined) {
			// No batch: the first lands alone, and what overlaps it is brought
			// up to the tip by its author once it has.
			for (const { pr } of group.slice(1))
				why(
					pr.number,
					`waits for #${String(first.pr.number)}, which it overlaps`,
				);
			return settleGroup([first]);
		}
		const suspects = group.filter(({ pr }) => aloneOnTip.has(pr.number));
		const rest = group.filter(({ pr }) => !aloneOnTip.has(pr.number));
		const [alone] = suspects;
		if (alone !== undefined && !aloneBusy)
			await openBatch([alone.pr], 'a suspect, alone');
		const riders = trainMembers(
			rest.map(({ pr }) => ({
				number: pr.number,
				headRef: pr.headRef,
				headSha: pr.headSha,
			})),
			new Map(),
			deps.config.batchCapacity,
		);
		const members = rest
			.map(({ pr }) => pr)
			.filter((pr) => riders.some((r) => r.number === pr.number));
		if (members.length < 2) return;
		if (redSets.has(setKey(members.map((pr) => pr.number)))) {
			note(
				`batch ${members.map((pr) => pr.number).join('+')} was red on this tip: not repeated`,
			);
			return;
		}
		await openBatch(members, 'overlapping ready pull requests');
	};

	await Promise.all(groupByOverlap(candidates).map(settleGroup));
	// Judged first, applied once: the difference between what each pull
	// request wants and what the forge shows, and one reason line for each.
	for (const pr of openNow) {
		if (!reasons.has(pr.number)) why(pr.number, 'nothing to do this pass');
		if (mergedPRs.includes(pr.number)) continue;
		await reconcileLabels({
			forge,
			pr,
			wanted: wanted.get(pr.number) ?? new Map(),
			note,
		});
	}
	return {
		actions,
		reasons,
		mergedCount: mergedPRs.length,
		mergedPRs: [...mergedPRs].sort((a, b) => a - b),
		tipSha: await forge.integrationTip(),
	};
};
