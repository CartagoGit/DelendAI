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
import { attributeCulprit, trainMembers } from '../decisions/culprit.helper';
import { groupByOverlap, overlapBetween } from '../decisions/overlap.helper';
import type { IChangeFootprint } from '../decisions/overlap.interface';
import type { ITrainCandidate } from '../decisions/culprit.interface';
import { pullRequestReady } from '../decisions/readiness.helper';

import {
	BatchMemory,
	batchBody,
	readBatchRecord,
	refOf,
	setKey,
} from './land-batch-record.helper';
import { LAND_LABEL_CULPRIT, LAND_LABEL_NEEDS_UPDATE } from './land.constant';
import { closeRedBatch, labelNeedsUpdate } from './land-verdict.helper';
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
	const tip = await forge.integrationTip();
	const required =
		deps.config.requiredChecks.length > 0
			? deps.config.requiredChecks
			: await forge.requiredChecks();
	const batches = await forge.batchPullRequests(deps.config.batchPrefix);
	const recordOf = (pr: ILandPullRequest): ILandBatchRecord | undefined =>
		readBatchRecord(pr.body);

	const readyChecks = (
		pr: ILandPullRequest,
		checks: readonly ILandCheck[],
	): boolean =>
		pullRequestReady({
			draft: pr.draft,
			checks,
			required,
			labels: pr.labels,
			blockingLabels: [],
		});

	const memory = new BatchMemory(tip);
	for (const batch of batches) {
		const record = recordOf(batch);
		if (record !== undefined) memory.remember(record);
	}
	const { culpritHeads, redSets, aloneOnTip } = memory;
	const remember = (record: ILandBatchRecord): void =>
		memory.remember(record);

	const needsUpdate = (pr: ILandPullRequest, why: string): Promise<void> =>
		labelNeedsUpdate(forge, pr, why, note);

	const markRed = async (
		batch: ILandPullRequest,
		record: ILandBatchRecord,
		checks: readonly ILandCheck[],
	): Promise<ILandBatchRecord> => {
		const failing = checks.filter((c) => FAILED.has(c.conclusion ?? ''));
		const open: ILandPullRequest[] = [];
		for (const member of record.members) {
			const pr = await forge.pullRequest(member.number);
			if (pr.state === 'open' && pr.headSha === member.sha) open.push(pr);
		}
		const attribution =
			open.length === 1
				? { culprit: open[0]?.number, suspects: [open[0]?.number ?? 0] }
				: attributeCulprit({
						failingZones: new Set(
							failing.flatMap(
								(c) => deps.config.sectionOfCheck(c.name) ?? [],
							),
						),
						failingSpecs: new Set(
							failing.flatMap((c) => c.failingSpecs ?? []),
						),
						members: open.map((pr) => ({
							number: pr.number,
							own: git.footprint(pr),
						})),
					});
		// A failure no check section or spec ties to anyone is every member's.
		const suspects =
			attribution.suspects.length > 0
				? attribution.suspects
				: open.map((pr) => pr.number);
		const red: ILandBatchRecord = {
			...record,
			red: {
				...(attribution.culprit === undefined
					? {}
					: { culprit: attribution.culprit }),
				suspects,
			},
		};
		// The verdict is written first: a pass that dies after it finishes
		// the labelling and the closing from this record.
		await forge.updatePullRequest(batch.number, batchBody(red, new Map()));
		note(
			`batch #${String(batch.number)} is red: ${attribution.culprit === undefined ? `no single owner, suspects ${suspects.join(',')}` : `culprit #${String(attribution.culprit)}`}`,
		);
		return red;
	};

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
		if (!started && (changed || record.tip !== tip)) {
			await forge.closePullRequest(batch.number);
			note(
				`batch #${String(batch.number)} is stale: closed, rebuilt below`,
			);
			return false;
		}
		if (checks.some((c) => FAILED.has(c.conclusion ?? ''))) {
			const red = await markRed(batch, record, checks);
			remember(red);
			await finishRed(batch, red, checks);
			return false;
		}
		if (!readyChecks(batch, checks)) return true;
		const tested = git.treeOf(batch.headSha);
		if (record.regenerated) {
			// A regeneration commit rides on the batch branch only, and the
			// forge cannot merge members that collide in a derived file one by
			// one: the batch itself lands, carrying every member's commits.
			const merged = await forge.merge(batch.number, batch.headSha);
			if (merged !== 'merged') {
				note(
					`batch #${String(batch.number)} not merged (${merged}): next pass`,
				);
				return true;
			}
			for (const { pr } of open) {
				const now = await forge.pullRequest(pr.number);
				if (now.state !== 'open') continue;
				await forge.comment(
					pr.number,
					`land: landed in batch #${String(batch.number)}.`,
				);
				await forge.closePullRequest(pr.number);
			}
			note(`batch #${String(batch.number)} merged with its regeneration`);
		} else {
			for (const { pr, recorded } of open) {
				if (pr.headSha !== recorded) {
					note(
						`#${String(pr.number)} changed since the batch: left out`,
					);
					continue;
				}
				const merged = await forge.merge(pr.number, recorded);
				if (merged !== 'merged') {
					note(
						`#${String(pr.number)} not merged (${merged}): next pass`,
					);
					return true;
				}
				note(
					`#${String(pr.number)} merged in batch #${String(batch.number)}`,
				);
			}
		}
		if (git.treeOf(await forge.integrationTip()) !== tested) {
			await forge.comment(
				batch.number,
				'land: the integration tree differs from the tested one (a member was left out or the branch moved). Nothing is reverted; the integration CI judges it.',
			);
			note(
				`batch #${String(batch.number)}: tree differs from the tested one`,
			);
		} else {
			note(`batch #${String(batch.number)}: tree equals the tested one`);
		}
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
	for (const pr of await forge.openPullRequests()) {
		if (inFlight.has(pr.number)) continue;
		if (culpritHeads.get(pr.number) === pr.headSha) continue;
		if (pr.labels.includes(LAND_LABEL_CULPRIT)) {
			await forge.removeLabel(pr.number, LAND_LABEL_CULPRIT);
		}
		if (!readyChecks(pr, await forge.checks(pr.headSha))) continue;
		const conflict = git.conflictOf(pr, tip);
		if (conflict === 'authored') {
			await needsUpdate(pr, 'it conflicts with the integration branch');
			continue;
		}
		if (pr.labels.includes(LAND_LABEL_NEEDS_UPDATE)) {
			await forge.removeLabel(pr.number, LAND_LABEL_NEEDS_UPDATE);
		}
		candidates.push({ pr, own: git.footprint(pr), conflict });
	}
	candidates.sort((a, b) => a.pr.number - b.pr.number);

	const openBatch = async (
		members: readonly ILandPullRequest[],
		why: string,
	): Promise<void> => {
		const candidatesOf: ITrainCandidate[] = members.map((pr) => ({
			number: pr.number,
			headRef: pr.headRef,
			headSha: pr.headSha,
		}));
		const numbers = candidatesOf.map((c) => c.number);
		const ref = refOf(deps.config.batchPrefix, numbers);
		const built = git.buildBatch({ ref, tip, members: candidatesOf });
		if (built.conflicting.length > 0) {
			// Members that clash inside the batch go back to their authors; the
			// rest are built again, once, without them.
			for (const n of built.conflicting) {
				const pr = members.find((m) => m.number === n);
				if (pr !== undefined)
					await needsUpdate(pr, 'it conflicts with another member');
			}
			const rest = members.filter(
				(pr) => !built.conflicting.includes(pr.number),
			);
			if (rest.length > 0) await openBatch(rest, why);
			return;
		}
		if (built.sha === undefined) {
			note(
				`batch ${numbers.join('+')} not pushed: ${built.failure ?? 'a member conflicts'}`,
			);
			return;
		}
		const record: ILandBatchRecord = {
			tip,
			members: members.map((pr) => ({
				number: pr.number,
				sha: pr.headSha,
			})),
			regenerated: built.regenerated,
		};
		const number = await forge.openPullRequest({
			head: ref,
			title: `chore(queue): batch ${numbers.map((n) => `#${String(n)}`).join(' ')}`,
			body: batchBody(record, new Map()),
		});
		note(
			`batch #${String(number)} opened for ${numbers.join('+')} (${why})`,
		);
	};

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
			if (aloneOnTip.has(pr.number)) {
				return aloneBusy
					? undefined
					: openBatch([pr], 'a suspect, tested alone');
			}
			if (conflict === 'derived') {
				return openBatch([pr], 'derived files to regenerate');
			}
			const gained =
				pr.testedBase === tip
					? undefined
					: git.landedSince(pr.testedBase, tip);
			if (
				gained !== undefined &&
				overlapBetween(own, gained) !== undefined
			) {
				const updated = await forge.updateBranch(pr.number, pr.headSha);
				note(
					`#${String(pr.number)} brought up to the tip (${updated})`,
				);
				return;
			}
			const merged = await forge.merge(pr.number, pr.headSha);
			note(
				merged === 'merged'
					? `#${String(pr.number)} merged at ${pr.headSha.slice(0, 12)}`
					: `#${String(pr.number)} not merged (${merged}): next pass`,
			);
			return;
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
	return { actions };
};
