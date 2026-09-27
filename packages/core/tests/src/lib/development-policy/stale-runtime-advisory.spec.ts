/**
 * A server running older code than its checkout says so (x00701).
 */
import { describe, expect, it } from 'vitest';

import { waitUntil } from '@delendai/test-kit';

import {
	createStaleRuntimeAdvisory,
	staleRuntimeAdvisoryFor,
} from '@delendai/core/lib/development-policy/stale-runtime-advisory';

import type { ICheckpointAdvisoryContext } from '@delendai/core/lib/contracts/interfaces/checkpoint-advisory.interface';

const CALL: ICheckpointAdvisoryContext = { toolName: 't', args: {} };
const BOOT = 'a'.repeat(40);
const NOW = 'b'.repeat(40);

describe('staleRuntimeAdvisoryFor', () => {
	it('names the restart when a source file the server runs changed', () => {
		const advisory = staleRuntimeAdvisoryFor({
			bootHead: BOOT,
			head: NOW,
			changed: ['packages/cli/src/commands/work.command.ts', 'README.md'],
		});
		expect(advisory?.code).toBe('SERVER_BEHIND_CHECKOUT');
		expect(advisory?.message).toContain('1 source file(s)');
		expect(advisory?.nextAction).toContain(
			'Restart the delendai MCP server',
		);
	});

	it('stays quiet when nothing the server runs changed', () => {
		expect(
			staleRuntimeAdvisoryFor({
				bootHead: BOOT,
				head: NOW,
				changed: [
					'docs/delendai/proposals/review/x1.md',
					'plugins/a/tests/x.spec.ts',
				],
			}),
		).toBeNull();
		expect(
			staleRuntimeAdvisoryFor({
				bootHead: BOOT,
				head: BOOT,
				changed: [],
			}),
		).toBeNull();
	});
});

describe('createStaleRuntimeAdvisory', () => {
	it('records the boot commit, then compares the checkout on its interval', async () => {
		let head = BOOT;
		let clock = 0;
		const advisory = createStaleRuntimeAdvisory('/repo', {
			head: async () => head,
			changedBetween: async () => ['plugins/proposals/src/lib/x.ts'],
			now: () => clock,
			intervalMs: 10,
		});
		await Promise.resolve();
		expect(advisory(CALL)).toBeNull();
		head = NOW;
		clock = 20;
		await waitUntil(
			'the checkout comparison lands',
			() => advisory(CALL)?.code === 'SERVER_BEHIND_CHECKOUT',
		);
	});
});
