/**
 * run-tool.ts — `commit_policy_run`.
 *
 * Manual entry point that fires any trigger by `kind`.
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import z from 'zod';

import type { IToolRegistration } from '@mcp-vertex/core/public';
import { toolError, toolOk } from '@mcp-vertex/core/public';

import type { ICommitPolicyOptions } from '../contracts/options';
import { localizedString } from '../contracts/i18n-types';
import {
	runCommitDriver,
	type ICommitDriverOptions,
	type ICommitDriverResult,
} from '../services/commit-driver';
import { gitDirtyFileCount } from '../services/git-extra';
import { readCurrentSliceSnapshot } from '../triggers/slice-listener';
import { createThresholdTracker } from '../triggers/threshold-tracker';
import { createIntervalTimer } from '../triggers/interval-timer';
import { manualTrigger } from '../triggers/manual-trigger';
import type { ITriggerEvent } from '../triggers/trigger-types';
import { findTrigger } from '../triggers/trigger-types';

export interface IRunToolOptions extends ICommitDriverOptions {
	readonly namespacePrefix: string;
	readonly policy: ICommitPolicyOptions;
	readonly workspaceRoot: string;
	readonly docsDir: string;
	readonly locale?: string | undefined;
}

const InputSchema = z.object({
	kind: z.enum(['manual', 'slice', 'threshold', 'interval']),
	proposalId: z.string().optional(),
	sliceId: z.string().optional(),
});

const OutputSchema = z.object({
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
});

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
	const hasProposal =
		selector !== undefined &&
		selector.proposalId !== undefined &&
		selector.proposalId.length > 0;
	const hasSlice =
		selector !== undefined &&
		selector.sliceId !== undefined &&
		selector.sliceId.length > 0;
	if (!hasProposal && !hasSlice) {
		return { ok: false, refusal: 'SELECTOR_REQUIRED' };
	}
	if (hasProposal !== hasSlice) {
		return { ok: false, refusal: 'INCOMPLETE_SELECTOR' };
	}
	const proposalId = selector!.proposalId as string;
	const sliceId = selector!.sliceId as string;
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
	return {
		kind: 'slice',
		proposalId: entry.proposalId,
		sliceId,
		status: entry.status,
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
	const timer = createIntervalTimer(options.run, {
		minutes: trigger.minutes,
	});
	const event = await timer.check(trigger.minutes * 60_000);
	if (event === null) {
		return { ok: false, refusal: 'interval not elapsed or no dirty work' };
	}
	return event;
};

const pinSliceContext = (
	event: ITriggerEvent,
): { proposalId: string; sliceId: string; files: readonly string[] } | null => {
	if (event.proposalId === undefined || event.sliceId === undefined) {
		return null;
	}
	return {
		proposalId: event.proposalId,
		sliceId: event.sliceId,
		files: [],
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

	const commitInput =
		slicePin !== null
			? {
					message: `feat(${slicePin.proposalId}): commit via ${triggerEvent.kind}`,
					sliceContext: slicePin,
				}
			: {
					message: `chore: commit via ${triggerEvent.kind}`,
					files: [] as readonly string[],
				};

	const result: ICommitDriverResult = await runCommitDriver(
		commitInput,
		options,
	);

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
		'Manually fire any configured trigger (manual always available; slice/threshold/interval require cadence.triggers).',
	tags: ['commit-policy', 'run', 'write'],
	effects: ['write'],
	register: async (server: McpServer) => {
		server.registerTool(
			`${options.namespacePrefix}_commit_policy_run`,
			{
				description:
					'Fire one trigger by kind. `manual` is always available; `slice`/`threshold`/`interval` are gated by cadence.triggers — refusing with a typed reason when not configured.',
				outputSchema: OutputSchema,
				inputSchema: InputSchema,
			},
			async (args) => runCommitPolicyRun(args, options),
		);
	},
});
