/**
 * assemble.advisory-hooks.spec.ts — what the host gets when several
 * plugins all have an opinion about the call being made.
 *
 * Three hooks are composed by the assembler and none had a test:
 * `getCheckpointAdvisory` (strongest advisory wins), `beforeToolCall`
 * (same merge, but a `block` short-circuits the handler) and
 * `isAgentStuck` (a single-slot hook that must answer `null`, never
 * `undefined`, so a host can branch on it).
 *
 * A fourth, `onToolCancel`, is composed the same way and is tested here
 * for the case a host cannot always supply: a cancellation with no
 * context at all.
 *
 * These matter precisely in the many-plugins case this project is for:
 * a merge that silently kept the FIRST opinion instead of the strongest
 * would let a `recommend` from one plugin hide another plugin's `block`,
 * and nothing else in the suite would notice.
 */
import { afterAll, describe, expect, it } from 'vitest';

import { assembleCliConfig } from '@delendai/core/lib/cli/assemble';
import { parseCliArgs } from '@delendai/core/lib/plugins/parse-cli-args';

import type { ICheckpointAdvisory } from '../../../../src/lib/contracts/interfaces/checkpoint-advisory.interface';
import { createTestWorkspace, removeTestWorkspace } from '../test-workspace';

const WORKSPACE = createTestWorkspace('delendai-advisory-hooks-');
afterAll(() => removeTestWorkspace(WORKSPACE));

const advisory = (
	severity: ICheckpointAdvisory['severity'],
	code: string,
): ICheckpointAdvisory => ({
	triggered: true,
	code,
	severity,
	message: `${code} says ${severity}`,
	reason: 'test',
	nextAction: 'checkpoint',
	dedupeKey: code,
});

/** Registers the weaker opinion, plus the single-slot stuck detector. */
const pluginRecommend = {
	name: 'pluginRecommend',
	register: () => ({
		getCheckpointAdvisory: () => advisory('recommend', 'recommend-first'),
		beforeToolCall: () => advisory('recommend', 'before-recommend'),
		isAgentStuck: (toolName: string) =>
			toolName === 'looping_tool'
				? {
						handoffPath: 'docs/handoff.md',
						suggestedAction: 'hand off',
					}
				: null,
	}),
};

/** What `pluginBlock`'s cancellation observer was handed, if anything. */
const cancellations: {
	toolName: string;
	elapsedMs: number;
	reason: string;
	error: string;
}[] = [];

/** Registers the stronger opinion, and registers it SECOND. */
const pluginBlock = {
	name: 'pluginBlock',
	register: () => ({
		getCheckpointAdvisory: () => advisory('block', 'block-second'),
		beforeToolCall: () => advisory('block', 'before-block'),
		onToolCancel: (
			toolName: string,
			_args: unknown,
			elapsedMs: number,
			cancellation: { reason: string; error: unknown },
		) => {
			cancellations.push({
				toolName,
				elapsedMs,
				reason: cancellation.reason,
				error: String(cancellation.error),
			});
		},
	}),
};

const assemble = async () =>
	assembleCliConfig(
		parseCliArgs(
			[
				'--plugins=pluginRecommend,pluginBlock',
				`--workspace=${WORKSPACE}`,
				'--surface=native',
			],
			WORKSPACE,
		),
		{
			readFile: async () => undefined,
			import: async (specifier: string) =>
				specifier.includes('pluginBlock')
					? { default: pluginBlock }
					: { default: pluginRecommend },
		},
	);

const CONTEXT = { toolName: 'some_tool', args: { a: 1 } };

describe('hooks composed across plugins', () => {
	it('serves the strongest checkpoint advisory, not the first one', async () => {
		const { config } = await assemble();

		// Registration order is recommend-then-block on purpose: a merge
		// that returned the first triggered candidate would pass every
		// other assertion here and still hide a block in production.
		expect(config.getCheckpointAdvisory?.(CONTEXT)?.code).toBe(
			'block-second',
		);
	});

	it('applies the same precedence to the pre-handler hook', async () => {
		const { config } = await assemble();

		const merged = config.beforeToolCall?.(CONTEXT);
		expect(merged?.code).toBe('before-block');
		// The severity is what the core reads to short-circuit the
		// handler, so it travels with the winner or the block is lost.
		expect(merged?.severity).toBe('block');
	});

	it('answers the stuck detector with null rather than undefined', async () => {
		const { config } = await assemble();

		expect(config.isAgentStuck?.('looping_tool', {})).toEqual({
			handoffPath: 'docs/handoff.md',
			suggestedAction: 'hand off',
		});
		// `undefined` here would read as "no detector installed" to a
		// host that branches on presence; the assembler normalises it.
		expect(config.isAgentStuck?.('some_other_tool', {})).toBeNull();
	});

	it('hands a cancellation observer an envelope even with no context', async () => {
		cancellations.length = 0;
		const { config } = await assemble();

		// A host that aborts a call may have nothing to say about why.
		// Passing that straight through would give every observer an
		// `undefined` to guard, and the ones that forgot would throw
		// inside the cancellation path — where the failure is invisible.
		await config.onToolCancel?.('slow_tool', { a: 1 }, 1234, undefined);

		expect(cancellations).toEqual([
			{
				toolName: 'slow_tool',
				elapsedMs: 1234,
				reason: 'tool invocation aborted',
				error: 'Error: tool invocation aborted',
			},
		]);
	});
});
