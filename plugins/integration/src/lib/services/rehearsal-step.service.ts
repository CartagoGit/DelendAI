/**
 * rehearsal-step.service.ts — the steps a scenario takes as the author or
 * the environment, one handler per kind, found by the kind itself. When the
 * integrator does not act, a wake is taken and counted as a manual step.
 */
import {
	REHEARSAL_AWAIT_CAP_SECONDS,
	REHEARSAL_DIR,
	REHEARSAL_POLL_MS,
	REHEARSAL_TOKEN_OPEN_LABEL,
	REHEARSAL_TOKEN_WAIT_SECONDS,
	REHEARSAL_TOKEN_PUSH_LABEL,
} from '../contracts/constants/rehearsal.constant';
import type {
	IRehearsalClock,
	IRehearsalPullSpec,
	IRehearsalPullState,
	IRehearsalRunContext,
	IRehearsalScenario,
	IRehearsalStep,
	IScenarioState,
} from '../contracts/interfaces/rehearsal.interface';

import { receive } from './rehearsal-receive.helper';
import { awaitedChecks, openRuns, redEndsWait } from './rehearsal-wait.helper';
import {
	pullChanges,
	pullHead,
	runBranchRoot,
	runLabelPrefix,
} from './rehearsal-names.helper';

const isoOf = (clock: IRehearsalClock): string =>
	new Date(clock.now()).toISOString();

const TOKEN_WAIT_MS = REHEARSAL_TOKEN_WAIT_SECONDS * 1000;

const specOfIn =
	(scenario: IRehearsalScenario) =>
	(key: string): IRehearsalPullSpec => {
		const spec = scenario.pulls.find((pull) => pull.key === key);
		if (spec === undefined)
			throw new Error(`scenario ${scenario.id} has no pull ${key}`);
		return spec;
	};

const pullByKey = async (
	ctx: IRehearsalRunContext,
	state: IScenarioState,
): Promise<ReadonlyMap<string, IRehearsalPullState>> => {
	const open = await ctx.forge.pulls(state.integration);
	const byNumber = new Map(open.map((pull) => [pull.number, pull]));
	const found = new Map<string, IRehearsalPullState>();
	for (const [key, number] of [
		...state.numbers,
		...[...state.tokenPulls].map(
			([key, number]) => [`${key}:token-open`, number] as const,
		),
	]) {
		const pull = byNumber.get(number);
		if (pull !== undefined) found.set(key, pull);
	}
	return found;
};

const satisfied = async (
	ctx: IRehearsalRunContext,
	state: IScenarioState,
	step: Extract<IRehearsalStep, { kind: 'await' }>,
): Promise<readonly string[]> => {
	const pulls = await pullByKey(ctx, state);
	const pending: string[] = [];
	for (const key of step.keys) {
		const pull = pulls.get(key);
		if (pull === undefined) {
			pending.push(key);
			continue;
		}
		if (step.until === 'merged' && pull.mergedAt === undefined)
			pending.push(key);
		if (
			step.until === 'labelled' &&
			!pull.labels.some(
				(label) =>
					label.endsWith('needs-update') || label.endsWith('culprit'),
			)
		)
			pending.push(key);
		if (step.until === 'checked') {
			const runs = await ctx.forge.runs(pull.head);
			if (
				!runs.some(
					(run) =>
						run.headSha === pull.headSha &&
						run.status === 'completed',
				)
			)
				pending.push(key);
		}
	}
	return pending;
};

/**
 * Close a pull request and reopen it: the events the integrator wakes on,
 * the ones its own bring-forward makes. Converting to draft is refused to the
 * integrator's App (it never succeeded in a logged run), so it is not used.
 */
const wake = async (
	ctx: IRehearsalRunContext,
	state: IScenarioState,
	keys: readonly string[],
): Promise<void> => {
	for (const key of keys) {
		const number = state.numbers.get(key);
		if (number === undefined) continue;
		await ctx.forge.closePull(number);
		await ctx.forge.reopenPull(number);
		state.manualSteps.push(
			`woke the integrator for ${key} (#${String(number)}) at ${isoOf(ctx.clock)}`,
		);
	}
};

/** Whether any workflow run on the scenario's integration branch or its pull requests' heads is queued or in progress. */
const somethingRuns = async (
	ctx: IRehearsalRunContext,
	state: IScenarioState,
): Promise<boolean> => {
	const heads = new Set([
		state.integration,
		...(await ctx.forge.pulls(state.integration)).map((pull) => pull.head),
	]);
	for (const head of heads)
		if (openRuns(await ctx.forge.runs(head)).length > 0) return true;
	return false;
};

/**
 * Waits for `step`. Its clock advances only while no workflow run is queued
 * or in progress on the scenario (the project's real CI takes as long as it
 * takes): it fails after `seconds` of idleness, and after the absolute cap
 * whatever runs.
 */
const awaitStep = async (
	ctx: IRehearsalRunContext,
	scenario: IRehearsalScenario,
	state: IScenarioState,
	step: Extract<IRehearsalStep, { kind: 'await' }>,
): Promise<void> => {
	const started = ctx.clock.now();
	let lastTick = started;
	let lastWake = started;
	let idleMs = 0;
	for (;;) {
		const pending = await satisfied(ctx, state, step);
		if (pending.length === 0) return;
		const now = ctx.clock.now();
		const checks = await awaitedChecks(
			ctx.forge,
			await pullByKey(ctx, state),
			pending,
			ctx.setup.requiredChecks,
		);
		if (step.until === 'merged' && redEndsWait(scenario) && checks.red) {
			state.failures.push(
				`${step.until} not reachable for ${checks.red.key}: ${checks.red.name} ended ${checks.red.conclusion} on its head (check run ${String(checks.red.id)})`,
			);
			return;
		}
		// Once the awaited pull requests' own checks have finished, the integrator's
		// runs no longer excuse the wait: its budget counts wall time.
		const running = await somethingRuns(ctx, state);
		const busy = running && !checks.concluded;
		if (!busy) idleMs += now - lastTick;
		lastTick = now;
		if (now - started >= REHEARSAL_AWAIT_CAP_SECONDS * 1000) {
			state.failures.push(
				`${step.until} not reached within the ${String(REHEARSAL_AWAIT_CAP_SECONDS)} s cap for ${pending.join(', ')}`,
			);
			return;
		}
		if (idleMs >= step.seconds * 1000) {
			state.failures.push(
				`${step.until} not reached in ${String(step.seconds)} s for ${pending.join(', ')}`,
			);
			return;
		}
		if (
			step.wakeAfterSeconds !== undefined &&
			now - lastWake >= step.wakeAfterSeconds * 1000 &&
			// A wake is a manual step only when the system is idle: a run of the
			// integrator that is queued or in progress is the signal arriving, and
			// the pull requests' own checks having finished does not make it idle.
			!running
		) {
			await wake(ctx, state, pending);
			lastWake = now;
		}
		await ctx.clock.wait(REHEARSAL_POLL_MS);
	}
};

const openPull = async (
	ctx: IRehearsalRunContext,
	scenario: IRehearsalScenario,
	state: IScenarioState,
	spec: IRehearsalPullSpec,
): Promise<void> => {
	const head = pullHead(ctx.branchPrefix, ctx.runId, scenario.id, spec.key);
	const tip = await ctx.forge.tipOf(state.integration);
	await ctx.forge.createBranch(head, tip);
	await ctx.forge.commit({
		branch: head,
		parents: [tip],
		message: `rehearsal(${scenario.id}): ${spec.key}`,
		changes: pullChanges(ctx.runId, scenario.id, spec),
	});
	const number = await ctx.forge.openPull({
		head,
		base: state.integration,
		title: `rehearsal ${ctx.runId} ${scenario.id}: ${spec.key}`,
		body: `A synthetic pull request of rehearsal run \`${ctx.runId}\`, scenario \`${scenario.id}\` (${scenario.title}). It writes only under \`${REHEARSAL_DIR}/\` and never reaches the integration branch of the project.`,
		draft: spec.draft === true,
	});
	state.numbers.set(spec.key, number);
};

/** Waits until the pull request's head moves off `from`; returns the new head, if any. */
const nextHead = async (
	ctx: IRehearsalRunContext,
	state: IScenarioState,
	key: string,
	from: string,
	seconds: number,
): Promise<string | undefined> => {
	const started = ctx.clock.now();
	while (ctx.clock.now() - started < seconds * 1000) {
		const pull = (await pullByKey(ctx, state)).get(key);
		if (pull !== undefined && pull.headSha !== from) return pull.headSha;
		await ctx.clock.wait(REHEARSAL_POLL_MS);
	}
	return undefined;
};

type TSteps = {
	readonly [K in IRehearsalStep['kind']]: (
		ctx: IRehearsalRunContext,
		scenario: IRehearsalScenario,
		state: IScenarioState,
		step: Extract<IRehearsalStep, { kind: K }>,
	) => Promise<void>;
};

const STEPS: TSteps = {
	open: async (ctx, scenario, state, step) => {
		const specOf = specOfIn(scenario);
		for (const key of step.keys)
			await openPull(ctx, scenario, state, specOf(key));
		return;
	},
	ready: async (ctx, scenario, state, step) => {
		const _specOf = specOfIn(scenario);
		for (const key of step.keys) {
			const number = state.numbers.get(key);
			if (number !== undefined) await ctx.forge.setDraft(number, false);
		}
		return;
	},
	await: async (ctx, scenario, state, step) => {
		const _specOf = specOfIn(scenario);
		await awaitStep(ctx, scenario, state, step);
		return;
	},
	'author-update': async (ctx, scenario, state, step) => {
		const specOf = specOfIn(scenario);

		const pull = (await pullByKey(ctx, state)).get(step.key);
		if (pull === undefined) {
			state.failures.push(`author-update: ${step.key} is not open`);
			return;
		}
		// The author merges the integration branch in and resolves to its
		// own version of the files it was told about.
		const tip = await ctx.forge.tipOf(state.integration);
		await ctx.forge.commit({
			branch: pull.head,
			parents: [pull.headSha, tip],
			treeFrom: tip,
			message: `rehearsal(${scenario.id}): ${step.key} brought up to date by its author`,
			changes: pullChanges(
				ctx.runId,
				scenario.id,
				specOf(step.key),
				step.files,
			),
		});
		return;
	},
	'token-push': async (ctx, scenario, state, step) => {
		const _specOf = specOfIn(scenario);

		const pull = (await pullByKey(ctx, state)).get(step.key);
		if (pull === undefined) {
			state.failures.push(`token-push: ${step.key} is not open`);
			return;
		}
		await ctx.forge.addLabel(
			pull.number,
			`${runLabelPrefix(ctx.runId)}${REHEARSAL_TOKEN_PUSH_LABEL}`,
		);
		const head = await nextHead(
			ctx,
			state,
			step.key,
			pull.headSha,
			REHEARSAL_TOKEN_WAIT_SECONDS,
		);
		if (head === undefined)
			state.failures.push(
				`token-push: the workflow token pushed nothing to ${step.key}`,
			);
		else state.tokenHeads.set(step.key, [head]);
		return;
	},
	'token-open': async (ctx, scenario, state, step) => {
		const _specOf = specOfIn(scenario);

		const number = state.numbers.get(step.key);
		if (number === undefined) return;
		await ctx.forge.addLabel(
			number,
			`${runLabelPrefix(ctx.runId)}${REHEARSAL_TOKEN_OPEN_LABEL}`,
		);
		const head = `${runBranchRoot(ctx.branchPrefix, ctx.runId)}token-open-${String(number)}`;
		const started = ctx.clock.now();
		while (ctx.clock.now() - started < TOKEN_WAIT_MS) {
			const opened = (await ctx.forge.pulls(state.integration)).find(
				(pull) => pull.head === head,
			);
			if (opened !== undefined) {
				state.tokenPulls.set(step.key, opened.number);
				return;
			}
			await ctx.clock.wait(REHEARSAL_POLL_MS);
		}
		state.failures.push(
			`token-open: the workflow token opened no pull request for ${step.key}`,
		);
		return;
	},
	receive: async (ctx, scenario, state, step) => {
		const _specOf = specOfIn(scenario);
		await receive(ctx, state, step.keys);
		return;
	},
	'move-integration': async (ctx, scenario, state, step) => {
		const _specOf = specOfIn(scenario);

		const tip = await ctx.forge.tipOf(state.integration);
		await ctx.forge.commit({
			branch: state.integration,
			parents: [tip],
			message: `rehearsal(${scenario.id}): the integration branch moves under the run`,
			changes: [
				{
					path: `${REHEARSAL_DIR}/${ctx.runId}/${scenario.id}-${step.key}.txt`,
					content: `${step.key}\n`,
				},
			],
		});
		return;
	},
};

/** Takes one step of a scenario. */
export const runStep = async (
	ctx: IRehearsalRunContext,
	scenario: IRehearsalScenario,
	state: IScenarioState,
	step: IRehearsalStep,
): Promise<void> =>
	(
		STEPS[step.kind] as (
			ctx: IRehearsalRunContext,
			scenario: IRehearsalScenario,
			state: IScenarioState,
			step: IRehearsalStep,
		) => Promise<void>
	)(ctx, scenario, state, step);
