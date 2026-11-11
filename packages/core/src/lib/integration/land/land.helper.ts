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
import { whyNotReady } from '../decisions/readiness.helper';

import { BatchMemory, readBatchRecord } from './land-batch-record.helper';
import { settleCandidates } from './land-settle.helper';
import { guardedFor } from './land-role.helper';
import { LAND_LABEL_CULPRIT, LAND_LABEL_NEEDS_UPDATE } from './land.constant';
import { mergeCertifiedBatch } from './land-batch-merge.helper';
import {
	closeRedBatch,
	labelNeedsUpdate,
	markRedBatch,
} from './land-verdict.helper';
import type {
	ILandBatchRecord,
	ILandCandidate,
	ILandCheck,
	ILandDeps,
	ILandPullRequest,
	ILandReport,
} from './land.interface';

const FAILED = new Set(['failure', 'timed_out']);

/** One pass. Never throws on a forge refusal: it reports and leaves it to the next. */
export const landPass = async (given: ILandDeps): Promise<ILandReport> => {
	// The host's role never merges, and the integrator never pushes where
	// the host opens the batches: refused here, whatever a path asks.
	const deps = guardedFor(given);
	const { forge, git } = deps;
	const role = deps.role ?? 'integrate';
	const judges = role === 'integrate';
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

	/**
	 * The pull requests this pass judged in need of an update. The label is
	 * taken off only at the end of a pass, from those it no longer judged so:
	 * taken off before the judgement, it was put back one pass and taken off
	 * the next, and the host bringing labelled pull requests forward found it
	 * missing half the time (2026-11-11, #1875 for nine hours).
	 */
	const flagged = new Set<number>();
	const needsUpdate = (pr: ILandPullRequest, why: string): Promise<void> => {
		flagged.add(pr.number);
		return labelNeedsUpdate(forge, pr, why, note);
	};

	/**
	 * The host's view of an open batch: in flight while it is current, and
	 * closed when it is stale (nothing merged, a head or the tip moved), so
	 * the host builds it again on this tip. Judging and merging stay with
	 * the integrator.
	 */
	const hostHolds = async (batch: ILandPullRequest): Promise<boolean> => {
		const record = recordOf(batch);
		if (record === undefined || record.red !== undefined) return false;
		const members = await Promise.all(
			record.members.map(async (m) => ({
				recorded: m.sha,
				pr: await forge.pullRequest(m.number),
			})),
		);
		if (members.some(({ pr }) => pr.merged)) return true;
		const open = members.filter(({ pr }) => pr.state === 'open');
		if (open.length === 0) return false;
		if (
			record.tip === tip &&
			open.every(({ pr, recorded }) => pr.headSha === recorded)
		)
			return true;
		await forge.closePullRequest(batch.number);
		note(`batch #${String(batch.number)} is stale: closed, rebuilt below`);
		return false;
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
		if (await (judges ? settleBatch(batch) : hostHolds(batch))) {
			for (const m of members) inFlight.add(m.number);
		}
	}

	const aloneBusy = [...aloneOnTip].some((n) => inFlight.has(n));

	// The ready pull requests: green on their head, not a known culprit.
	const candidates: ILandCandidate[] = [];
	const open = await forge.openPullRequests();
	for (const pr of open) {
		if (inFlight.has(pr.number)) {
			why(pr.number, 'rides a batch under test');
			continue;
		}
		if (culpritHeads.get(pr.number) === pr.headSha) {
			why(pr.number, 'the culprit of a red batch: waits for a new head');
			continue;
		}
		if (judges && pr.labels.includes(LAND_LABEL_CULPRIT)) {
			await forge.removeLabel(pr.number, LAND_LABEL_CULPRIT);
		}
		const waits = notReady(pr, await forge.checks(pr.headSha));
		if (waits !== undefined) {
			why(pr.number, waits);
			// A head the forge never builds never turns green by waiting.
			if (
				judges &&
				pr.headAuthor !== undefined &&
				deps.config.unbuiltAuthors.includes(pr.headAuthor)
			)
				await needsUpdate(pr, waits);
			continue;
		}
		const conflict = git.conflictOf(pr, tip);
		if (conflict === 'authored') {
			why(
				pr.number,
				'needs update: it conflicts with the integration branch',
			);
			if (judges)
				await needsUpdate(
					pr,
					'it conflicts with the integration branch',
				);
			continue;
		}
		candidates.push({ pr, own: git.footprint(pr), conflict });
	}
	candidates.sort((a, b) => a.pr.number - b.pr.number);

	await settleCandidates(
		{
			deps,
			tip,
			note,
			needsUpdate,
			why,
			landed,
			aloneOnTip,
			aloneBusy,
			redSets,
		},
		candidates,
	);
	if (judges) {
		for (const pr of open) {
			if (
				pr.labels.includes(LAND_LABEL_NEEDS_UPDATE) &&
				!flagged.has(pr.number) &&
				!mergedPRs.includes(pr.number)
			)
				await forge.removeLabel(pr.number, LAND_LABEL_NEEDS_UPDATE);
		}
	}
	return {
		actions,
		reasons,
		mergedCount: mergedPRs.length,
		mergedPRs: [...mergedPRs].sort((a, b) => a - b),
		tipSha: await forge.integrationTip(),
	};
};
