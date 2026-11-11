/**
 * land-settle.helper.ts — what happens to the ready pull requests of one
 * pass, group by overlapping group.
 *
 * - One that touches nothing landed since its checks ran merges, pinned.
 * - An overlapping group rides ONE batch over the tip: its CI runs once
 *   for the whole group, and no member is updated or re-run on its own.
 *   The batch is opened by the batch opener the policy names: this pass
 *   (`integrator`), or the host's pass with the person's credentials
 *   (`host`), while this one only says each member waits for it.
 * - With no batches (`none`), the ready members land one at a time, and
 *   one that needs an update never holds back the ready ones.
 */
import { trainMembers } from '../decisions/culprit.helper';
import { groupByOverlap, overlapBetween } from '../decisions/overlap.helper';
import { setKey } from './land-batch-record.helper';
import { openBatch } from './land-batch-open.helper';
import type {
	ILandCandidate,
	ILandPullRequest,
	ILandSettleContext,
} from './land.interface';

/** Settle every group of ready pull requests; groups that do not overlap proceed in parallel. */
export const settleCandidates = async (
	ctx: ILandSettleContext,
	candidates: readonly ILandCandidate[],
): Promise<void> => {
	const { deps } = ctx;
	const role = deps.role ?? 'integrate';
	const opener = deps.config.batchOpener;
	const batching = opener !== 'none';
	const opens =
		batching && (role === 'open-batches' || opener === 'integrator');
	const merges = role === 'integrate';

	/** The batch of `members`: opened here, or awaited from the host. */
	const batch = async (
		members: readonly ILandPullRequest[],
		reason: string,
	): Promise<void> => {
		if (opens) {
			await openBatch(ctx, members, reason);
			return;
		}
		for (const pr of members)
			ctx.why(
				pr.number,
				`waits for its batch, opened by the host (${reason})`,
			);
	};

	/** One pull request; whether it merged. */
	const settleOne = async ({
		pr,
		own,
		conflict,
	}: ILandCandidate): Promise<boolean> => {
		if (batching && ctx.aloneOnTip.has(pr.number)) {
			if (ctx.aloneBusy) {
				ctx.why(
					pr.number,
					'a suspect of a red batch: waits for the one tested alone',
				);
				return false;
			}
			await batch([pr], 'a suspect, tested alone');
			return false;
		}
		const gained =
			pr.testedBase === ctx.tip
				? undefined
				: deps.git.landedSince(pr.testedBase, ctx.tip);
		const behind =
			gained !== undefined && overlapBetween(own, gained) !== undefined;
		if (conflict === 'derived' || behind) {
			const reason =
				conflict === 'derived'
					? 'its derived files conflict with the integration branch'
					: 'the integration branch changed what it touches since its checks ran';
			// A batch of one brings it up to the tip in one CI; without
			// batches its author's side does, and never the forge's update.
			if (batching) await batch([pr], reason);
			else if (merges) {
				ctx.why(pr.number, `needs update: ${reason}`);
				await ctx.needsUpdate(pr, reason);
			}
			return false;
		}
		if (!merges) {
			ctx.why(pr.number, 'ready: the integrator merges it');
			return false;
		}
		const merged = await deps.forge.merge(pr.number, pr.headSha);
		if (merged === 'merged') ctx.landed(pr.number);
		else ctx.why(pr.number, `not merged (${merged}): next pass`);
		ctx.note(
			merged === 'merged'
				? `#${String(pr.number)} merged at ${pr.headSha.slice(0, 12)}`
				: `#${String(pr.number)} not merged (${merged}): next pass`,
		);
		return merged === 'merged';
	};

	const settleGroup = async (
		group: readonly ILandCandidate[],
	): Promise<void> => {
		const [first] = group;
		if (first !== undefined && group.length === 1) {
			await settleOne(first);
			return;
		}
		if (!batching) {
			if (!merges) return;
			// The first member that can land now lands. One that needs an
			// update never holds back the ready ones behind it: on 2026-11-11
			// three green pull requests waited for one that was itself
			// waiting for its author, one full CI after another.
			for (const [index, entry] of group.entries()) {
				if (!(await settleOne(entry))) continue;
				for (const { pr } of group.slice(index + 1)) {
					const reason = `#${String(entry.pr.number)} just landed and overlaps it`;
					ctx.why(pr.number, `needs update: ${reason}`);
					await ctx.needsUpdate(pr, reason);
				}
				return;
			}
			return;
		}
		const suspects = group.filter(({ pr }) =>
			ctx.aloneOnTip.has(pr.number),
		);
		const rest = group.filter(({ pr }) => !ctx.aloneOnTip.has(pr.number));
		// One suspect at a time is tested alone; the others wait for it.
		const [suspect, ...later] = suspects;
		if (suspect !== undefined) await settleOne(suspect);
		for (const { pr } of later)
			ctx.why(
				pr.number,
				'a suspect of a red batch: waits for the one tested alone',
			);
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
		for (const { pr } of rest)
			if (!members.includes(pr))
				ctx.why(
					pr.number,
					'waits for the next batch: this one is full',
				);
		const [only] = members;
		if (only !== undefined && members.length === 1) {
			const entry = rest.find((c) => c.pr === only);
			if (entry !== undefined) await settleOne(entry);
			return;
		}
		if (members.length === 0) return;
		if (ctx.redSets.has(setKey(members.map((pr) => pr.number)))) {
			for (const pr of members)
				ctx.why(
					pr.number,
					'its batch was red on this tip: waits for a new head or tip',
				);
			return;
		}
		await batch(members, 'overlapping ready pull requests');
	};

	await Promise.all(groupByOverlap([...candidates]).map(settleGroup));
};
