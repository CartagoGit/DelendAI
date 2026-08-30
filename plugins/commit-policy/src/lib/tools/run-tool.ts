/**
 * run-tool.ts — `commit_policy_run`.
 *
 * Manual entry point that fires any trigger by `kind`.
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import z from 'zod';

import type { IToolRegistration } from '@mcp-vertex/core/public';
import { buildDryRunResult, toolError, toolOk } from '@mcp-vertex/core/public';

import type { ICommitPolicyOptions } from '../contracts/options';
import { branchProtectedRefusal, isBranchProtected } from '../contracts/branch';
import { buildTriggerCommitMessage } from '../engine';
import { localizedString } from '../contracts/i18n-types';
import {
	runCommitDriver,
	type ICommitDriverOptions,
	type ICommitDriverResult,
} from '../services/commit-driver';
import type { IPushDriverResult } from '../services/push-driver';
import { gitDirtyFileCount } from '../services/git-extra';
import { readCurrentSliceSnapshot } from '../triggers/slice-listener';
import { createThresholdTracker } from '../triggers/threshold-tracker';
import {
	createIntervalTimer,
	type IIntervalTimer,
} from '../triggers/interval-timer';
import { manualTrigger } from '../triggers/manual-trigger';
import type { ITriggerEvent } from '../triggers/trigger-types';
import { findTrigger } from '../triggers/trigger-types';

export interface IRunToolOptions extends ICommitDriverOptions {
	readonly namespacePrefix: string;
	readonly policy: ICommitPolicyOptions;
	readonly workspaceRoot: string;
	readonly docsDir: string;
	readonly intervalTimer?: IIntervalTimer | undefined;
	readonly locale?: string | undefined;
	readonly onCommitSucceeded?: () => Promise<IPushDriverResult | null>;
}

const InputSchema = z.object({
	kind: z.enum(['manual', 'slice', 'threshold', 'interval']),
	proposalId: z.string().optional(),
	sliceId: z.string().optional(),
	/**
	 * f00189 (Track F / security): when true the handler returns
	 * an `IDryRunResult` describing the change WITHOUT executing
	 * any git operation. Plugins and humans can preview the plan.
	 */
	dryRun: z.boolean().optional(),
});

const OutputSchema = z.union([
	// Live branch — the tool actually fired a trigger.
	z.object({
		ok: z.boolean(),
		fired: z.object({
			kind: z.string(),
			proposalId: z.string().optional(),
			sliceId: z.string().optional(),
			status: z.string().optional(),
			dirtyCount: z.number().optional(),
		}),
		commit: z.object({
			committed: z.boolean(),
			pushed: z.boolean(),
			hash: z.string().optional(),
			reason: z.string().optional(),
			refusal: z.string().optional(),
			resolvedAuthor: z
				.object({
					displayName: z.string(),
					email: z.string(),
					label: z.string(),
				})
				.optional(),
		}),
		message: z.string().optional(),
	}),
	// Dry-run branch — f00189 (Track F / security): the tool
	// returned a `DryRunResult` and did NOT execute any git
	// operation.
	z.object({
		ok: z.literal(true),
		dryRun: z.literal(true),
		wouldChange: z.array(
			z.object({
				kind: z.enum(['write', 'delete', 'rename', 'create', 'patch']),
				path: z.string(),
				summary: z.string(),
			}),
		),
		wouldRun: z.array(
			z.object({
				shape: z.enum(['shell', 'network', 'process', 'git', 'mcp']),
				target: z.string(),
				summary: z.string(),
			}),
		),
		risk: z.enum(['low', 'medium', 'high']),
		note: z.string().optional(),
	}),
]);

const resolveSliceSelector = (
	selector:
		| { readonly proposalId?: string; readonly sliceId?: string }
		| undefined,
):
	| { readonly proposalId: string; readonly sliceId: string }
	| { readonly refusal: 'SELECTOR_REQUIRED' | 'INCOMPLETE_SELECTOR' } => {
	const hasProposalField = selector?.proposalId !== undefined;
	const hasSliceField = selector?.sliceId !== undefined;
	if (!hasProposalField && !hasSliceField) {
		return { refusal: 'SELECTOR_REQUIRED' };
	}
	if (!hasProposalField || !hasSliceField) {
		return { refusal: 'INCOMPLETE_SELECTOR' };
	}
	const proposalId = selector.proposalId;
	const sliceId = selector.sliceId;
	if (proposalId.trim().length === 0 || sliceId.trim().length === 0) {
		return { refusal: 'INCOMPLETE_SELECTOR' };
	}
	return { proposalId, sliceId };
};

const sliceRefusal = async (
	options: IRunToolOptions,
	selector:
		| { readonly proposalId?: string; readonly sliceId?: string }
		| undefined,
): Promise<ITriggerEvent | { ok: false; refusal: string }> => {
	const trigger = findTrigger(options.policy.cadence, 'slice');
	if (trigger === undefined) {
		return { ok: false, refusal: 'no slice trigger configured' };
	}
	// x00262 (AUD-CP-004): the slice trigger now requires an
	// explicit (proposalId, sliceId) selector — never "first
	// eligible slice". Cross-agent, the implicit behaviour picked
	// the wrong slice and committed to it; here the operator
	// (or upstream code) names the exact slice to act on.
	const resolvedSelector = resolveSliceSelector(selector);
	if ('refusal' in resolvedSelector) {
		return { ok: false, refusal: resolvedSelector.refusal };
	}
	const { proposalId, sliceId } = resolvedSelector;
	const slices = await readCurrentSliceSnapshot(
		options.workspaceRoot,
		options.docsDir,
	);
	const key = `${proposalId}-${sliceId}`;
	const entry = slices.get(key);
	if (entry === undefined) {
		return { ok: false, refusal: `SLICE_NOT_FOUND: ${key}` };
	}
	if (!trigger.onStatuses.includes(entry.status as 'done' | 'merged')) {
		return {
			ok: false,
			refusal: `SLICE_NOT_IN_CONFIGURED_STATUS: ${key} status=${entry.status}`,
		};
	}
	// x00263 (AUD-CP-005): slices without declared files MUST
	// refuse rather than fall back to `skipAdd: true`. Otherwise
	// the driver would stage whatever the operator had already
	// staged — including work from other agents. Drivers that
	// accept an explicit `skipStageEmpty` flag may pass that
	// through; otherwise the refusal is final.
	if (entry.files === undefined || entry.files.length === 0) {
		return { ok: false, refusal: `SLICE_HAS_NO_FILES: ${key}` };
	}
	return {
		kind: 'slice',
		proposalId: entry.proposalId,
		sliceId,
		status: entry.status,
		files: { paths: entry.files },
	};
};

const thresholdRefusal = async (
	options: IRunToolOptions,
): Promise<ITriggerEvent | { ok: false; refusal: string }> => {
	const trigger = findTrigger(options.policy.cadence, 'threshold');
	if (trigger === undefined) {
		return { ok: false, refusal: 'no threshold trigger configured' };
	}
	const tracker = createThresholdTracker(options.run, {
		files: trigger.files,
	});
	const event = await tracker.check();
	if (event === null) {
		const dirty = await gitDirtyFileCount(options.run);
		return {
			ok: false,
			refusal: `threshold not reached: dirty=${dirty}, threshold=${trigger.files}`,
		};
	}
	return event;
};

const intervalRefusal = async (
	options: IRunToolOptions,
): Promise<ITriggerEvent | { ok: false; refusal: string }> => {
	const trigger = findTrigger(options.policy.cadence, 'interval');
	if (trigger === undefined) {
		return { ok: false, refusal: 'no interval trigger configured' };
	}
	const timer =
		options.intervalTimer ??
		createIntervalTimer(options.run, { minutes: trigger.minutes });
	const event = await timer.check(trigger.minutes * 60_000);
	if (event === null) {
		return { ok: false, refusal: 'interval not elapsed or no dirty work' };
	}
	return event;
};

/**
 * x00263 (AUD-CP-005): the slice event carries the paths the
 * slice owns. We propagate them verbatim so the driver stages
 * exactly that set — not whatever happened to be staged when
 * the trigger fired. Empty arrays are no longer accepted here;
 * the listener refuses them as `SLICE_HAS_NO_FILES` upstream.
 */
const pinSliceContext = (
	event: ITriggerEvent,
): {
	proposalId: string;
	sliceId: string;
	files: readonly string[];
} | null => {
	if (
		event.proposalId === undefined ||
		event.sliceId === undefined ||
		event.files === undefined
	) {
		return null;
	}
	return {
		proposalId: event.proposalId,
		sliceId: event.sliceId,
		files: event.files.paths,
	};
};

/**
 * x00264 (AUD-CP-006): non-slice triggers carry the dirty paths
 * the trigger saw, so the driver stages the same set.
 */
const pinTriggerContext = (
	event: ITriggerEvent,
): { kind: 'threshold' | 'interval'; files: readonly string[] } | null => {
	if (event.kind === 'slice' || event.kind === 'manual') return null;
	if (event.files === undefined) return null;
	return { kind: event.kind, files: event.files.paths };
};

/**
 * f00189 (Track F / security): compute the dry-run plan for a
 * given trigger kind WITHOUT executing any git command. Mirrors
 * the early-pipeline checks of `runCommitPolicyRun` (selector,
 * branch, message composition) so a refusal surfaces identically
 * — the only difference is that we never call the driver. Pure
 * over its inputs (the only I/O is the slice snapshot read for
 * `kind: 'slice'`, which is read-only).
 */
export const planCommitPolicyRun = async (
	args: z.infer<typeof InputSchema>,
	options: IRunToolOptions,
): Promise<
	| {
			readonly kind: 'plan';
			readonly plan: ReturnType<typeof buildDryRunResult>;
	  }
	| { readonly kind: 'refusal'; readonly refusal: string }
> => {
	// Step 1 — resolve the trigger event the same way the live
	// path does. Any refusal here short-circuits to the same
	// refusal the caller would have seen in production.
	let event: ITriggerEvent | { ok: false; refusal: string };
	switch (args.kind) {
		case 'manual':
			event = manualTrigger();
			break;
		case 'slice': {
			const selector: { proposalId?: string; sliceId?: string } = {};
			if (args.proposalId !== undefined)
				selector.proposalId = args.proposalId;
			if (args.sliceId !== undefined) selector.sliceId = args.sliceId;
			event = await sliceRefusal(options, selector);
			break;
		}
		case 'threshold':
			event = await thresholdRefusal(options);
			break;
		case 'interval':
			event = await intervalRefusal(options);
			break;
	}
	if ('ok' in event && event.ok === false) {
		return { kind: 'refusal', refusal: event.refusal };
	}
	const triggerEvent = event as ITriggerEvent;

	// Step 1.5 — branch policy (mirror of the live engine check at
	// f00182 step 2). The dry-run MUST refuse protected branches
	// just like the live path does, otherwise an agent could
	// preview a commit that the engine would refuse.
	const branch = await options.run(['rev-parse', '--abbrev-ref', 'HEAD']);
	const branchName =
		branch.ok && branch.output.trim() !== 'HEAD'
			? branch.output.trim()
			: undefined;
	const branchPolicy = {
		protected: options.policy.push.protectedBranches,
		...(options.policy.push.protectedPrefixes !== undefined
			? { protectedPrefixes: options.policy.push.protectedPrefixes }
			: {}),
	};
	if (isBranchProtected(branchName, branchPolicy)) {
		return {
			kind: 'refusal',
			refusal: `BRANCH_PROTECTED: ${branchProtectedRefusal(
				branchName ?? '(detached)',
				branchPolicy,
			)}`,
		};
	}

	// Step 2 — derive the file set the driver WOULD stage.
	const slicePin = pinSliceContext(triggerEvent);
	const triggerPin =
		slicePin === null ? pinTriggerContext(triggerEvent) : null;
	const wouldStage: readonly string[] =
		slicePin !== null
			? slicePin.files
			: triggerPin !== null
				? triggerPin.files
				: [];

	// Step 3 — compose the canonical commit message the engine
	// WOULD build. We re-use `composeMessage`-style wording here
	// without re-implementing the engine (the plan is descriptive,
	// not authoritative).
	const message =
		slicePin !== null
			? `feat(${slicePin.proposalId}): commit via ${triggerEvent.kind}`
			: triggerPin !== null
				? buildTriggerCommitMessage({
						kind: triggerPin.kind,
						dirtyCount:
							triggerEvent.dirtyCount ?? triggerPin.files.length,
						files: triggerPin.files,
					})
				: `chore: commit via ${triggerEvent.kind}`;

	// Step 4 — emit the canonical DryRunResult envelope.
	const risk: 'low' | 'medium' | 'high' = options.policy.push.enabled
		? 'medium'
		: 'low';
	const wouldChange = wouldStage.map((path) => ({
		kind: 'write' as const,
		path,
		summary: `stage ${path} and include in commit "${message}"`,
	}));
	const wouldRun = [
		{
			shape: 'git' as const,
			target: `git add -- ${wouldStage.join(' ')}`,
			summary: `stage ${wouldStage.length} file(s)`,
		},
		{
			shape: 'git' as const,
			target: `git commit -m "${message}"`,
			summary: 'create commit with the composed message',
		},
	];
	if (options.policy.push.enabled) {
		wouldRun.push({
			shape: 'git' as const,
			target: 'git push',
			summary: `push to remote per push policy`,
		});
	}
	return {
		kind: 'plan',
		plan: buildDryRunResult({
			wouldChange,
			wouldRun,
			risk,
			note: `trigger=${triggerEvent.kind}; dry-run — no git operation was executed.`,
		}),
	};
};

export const runCommitPolicyRun = async (
	args: z.infer<typeof InputSchema>,
	options: IRunToolOptions,
): Promise<ReturnType<typeof toolOk> | ReturnType<typeof toolError>> => {
	if (!options.policy.commit.enabled) {
		const localized = localizedString(options.locale, (catalog) => ({
			summary: catalog.tools.run.refuseDisabled,
			nextAction: catalog.tools.commit.nextActionCommit,
		}));
		return toolError(localized.summary, localized.nextAction);
	}

	// f00189 (Track F / security): when `dryRun === true`, plan
	// the change without executing it. We compute the same
	// selector + branch + message checks the engine runs, then
	// return the canonical DryRunResult envelope. No `git add`,
	// no `git commit`, no `git push` — those run only when
	// `args.dryRun` is unset or false.
	if (args.dryRun === true) {
		const planned = await planCommitPolicyRun(args, options);
		if (planned.kind === 'refusal') {
			return toolError(
				planned.refusal,
				'See commit_policy_status for details.',
			);
		}
		const { plan } = planned;
		// Spread the DryRunResult into a plain Record so the
		// toolOk envelope (`{ ok: true, ...data }`) accepts the
		// payload. The fields are exactly the DryRunResult fields
		// plus `ok: true`.
		return toolOk({
			dryRun: plan.dryRun,
			wouldChange: [...plan.wouldChange],
			wouldRun: [...plan.wouldRun],
			risk: plan.risk,
			...(plan.note !== undefined ? { note: plan.note } : {}),
		});
	}

	let event: ITriggerEvent | { ok: false; refusal: string };
	switch (args.kind) {
		case 'manual':
			event = manualTrigger();
			break;
		case 'slice': {
			const selector: { proposalId?: string; sliceId?: string } = {};
			if (args.proposalId !== undefined)
				selector.proposalId = args.proposalId;
			if (args.sliceId !== undefined) selector.sliceId = args.sliceId;
			event = await sliceRefusal(options, selector);
			break;
		}
		case 'threshold':
			event = await thresholdRefusal(options);
			break;
		case 'interval':
			event = await intervalRefusal(options);
			break;
	}

	if ('ok' in event && event.ok === false) {
		const localized = localizedString(options.locale, (catalog) => ({
			summary: catalog.tools.run.noTrigger({ kind: args.kind }),
			nextAction: event.refusal,
		}));
		return toolError(localized.summary, localized.nextAction);
	}

	const triggerEvent = event as ITriggerEvent;
	const slicePin = pinSliceContext(triggerEvent);
	const triggerPin =
		slicePin === null ? pinTriggerContext(triggerEvent) : null;

	const commitInput =
		slicePin !== null
			? {
					message: `feat(${slicePin.proposalId}): commit via ${triggerEvent.kind}`,
					sliceContext: slicePin,
				}
			: triggerPin !== null
				? {
						message: buildTriggerCommitMessage({
							kind: triggerPin.kind,
							dirtyCount:
								triggerEvent.dirtyCount ??
								triggerPin.files.length,
							files: triggerPin.files,
						}),
						triggerContext: triggerPin,
					}
				: {
						message: `chore: commit via ${triggerEvent.kind}`,
						files: [] as readonly string[],
					};

	let result: ICommitDriverResult = await runCommitDriver(
		commitInput,
		options,
	);
	if (result.committed && options.onCommitSucceeded !== undefined) {
		try {
			const pushResult = await options.onCommitSucceeded();
			if (pushResult !== null) {
				if (!pushResult.ok) {
					return toolError(
						JSON.stringify({
							committed: true,
							pushed: false,
							hash: result.hash,
							reason: pushResult.refusal,
						}),
						'Commit completed locally but the configured push failed; inspect the reason and retry push.',
					);
				}
				result = { ...result, pushed: true };
			}
		} catch (error) {
			return toolError(
				JSON.stringify({
					committed: true,
					pushed: false,
					hash: result.hash,
					reason:
						error instanceof Error ? error.message : String(error),
				}),
				'Commit completed locally but the configured push failed; inspect the reason and retry push.',
			);
		}
	}

	const parseResult = OutputSchema.safeParse({
		ok: result.committed && !result.refusal,
		fired: {
			kind: triggerEvent.kind,
			...(triggerEvent.proposalId !== undefined
				? { proposalId: triggerEvent.proposalId }
				: {}),
			...(triggerEvent.sliceId !== undefined
				? { sliceId: triggerEvent.sliceId }
				: {}),
			...(triggerEvent.status !== undefined
				? { status: triggerEvent.status }
				: {}),
			...(triggerEvent.dirtyCount !== undefined
				? { dirtyCount: triggerEvent.dirtyCount }
				: {}),
		},
		commit: {
			committed: result.committed,
			pushed: result.pushed,
			...(result.hash !== undefined ? { hash: result.hash } : {}),
			...(result.reason !== undefined ? { reason: result.reason } : {}),
			...(result.refusal !== undefined
				? { refusal: result.refusal }
				: {}),
			...(result.resolvedAuthor !== undefined
				? { resolvedAuthor: result.resolvedAuthor }
				: {}),
		},
	});
	if (!parseResult.success) {
		return toolError(
			`commit_policy_run output schema mismatch: ${parseResult.error.message}`,
			'Report this as a plugin bug.',
		);
	}

	if (result.refusal !== undefined) {
		return toolError(
			result.refusal,
			'See commit_policy_status for details.',
		);
	}

	const firedMessage = localizedString(options.locale, (catalog) =>
		catalog.tools.run.fired({
			kind: triggerEvent.kind,
			committed: result.committed,
			pushed: result.pushed,
		}),
	);

	return toolOk({
		...parseResult.data,
		message: firedMessage,
	});
};

export const buildRunToolRegistration = (
	options: IRunToolOptions,
): IToolRegistration => ({
	id: 'commit_policy_run',
	summary:
		'Manually fire any configured trigger (manual always available; slice/threshold/interval require cadence.triggers). Pass `dryRun: true` to preview the change without executing any git operation.',
	tags: ['commit-policy', 'run', 'write', 'dry-run'],
	// f00189 (Track F / security): the tool mutates git state,
	// so it MUST declare `dryRunSupported: true` and accept
	// `args.dryRun` to honour the transversal dry-run protocol.
	effects: ['write'],
	dryRunSupported: true,
	register: async (server: McpServer) => {
		server.registerTool(
			`${options.namespacePrefix}_commit_policy_run`,
			{
				description:
					'Fire one trigger by kind. `manual` is always available; `slice`/`threshold`/`interval` are gated by cadence.triggers — refusing with a typed reason when not configured. Pass `dryRun: true` to preview the change without executing any git operation (f00189).',
				outputSchema: OutputSchema,
				inputSchema: InputSchema,
			},
			async (args) => runCommitPolicyRun(args, options),
		);
	},
});
