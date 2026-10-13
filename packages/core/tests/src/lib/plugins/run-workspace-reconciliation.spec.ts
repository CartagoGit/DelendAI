/**
 * run-workspace-reconciliation.spec.ts — a plugin may contribute boot
 * reconciliation, and a broken contribution may not take the server
 * down with it.
 *
 * The design question this pins is who owns the dependency: the startup
 * reconciler needs a concrete storage engine, core may not import one,
 * so the work belongs to the plugin that already owns the database. The
 * risk that arrives with that answer is a third-party hook throwing on
 * every boot, which must degrade the report rather than the server.
 */

import { describe, expect, it } from 'vitest';

import {
	isWorkspaceDegraded,
	renderReconciliationReports,
	runWorkspaceReconciliation,
} from '@delendai/core/lib/plugins/run-workspace-reconciliation';

import type { IMcpPlugin } from '@delendai/core/lib/plugins/plugin-contract';

const input = {
	workspaceRoot: '/tmp/workspace',
	peerPlugins: ['proposals'],
};

const plugin = (
	name: string,
	hook?: IMcpPlugin['reconcileWorkspace'],
): IMcpPlugin =>
	({
		name,
		register: () => ({}),
		...(hook === undefined ? {} : { reconcileWorkspace: hook }),
	}) as IMcpPlugin;

describe('runWorkspaceReconciliation', () => {
	it('runs only the plugins that contributed one', async () => {
		const seen: string[] = [];
		const reports = await runWorkspaceReconciliation(
			[
				plugin('quiet'),
				plugin('sqlite', async () => {
					seen.push('sqlite');
					return {
						status: 'reconciled',
						summary: 'nothing to repair',
					};
				}),
			],
			input,
		);

		// A project without such a plugin has nothing to reconcile. That
		// is a correct answer, not a missing feature.
		expect(seen).toEqual(['sqlite']);
		expect(reports).toHaveLength(1);
		expect(reports[0]?.plugin).toBe('sqlite');
	});

	it('runs them sequentially, never concurrently', async () => {
		const order: string[] = [];
		const slow =
			(name: string, ms: number): IMcpPlugin['reconcileWorkspace'] =>
			async () => {
				await new Promise((resolve) => setTimeout(resolve, ms));
				order.push(name);
				return { status: 'reconciled' as const, summary: name };
			};

		await runWorkspaceReconciliation(
			[
				plugin('first', slow('first', 20)),
				plugin('second', slow('second', 1)),
			],
			input,
		);

		// Two reconcilers touching one workspace at once is precisely the
		// race each of them exists to resolve.
		expect(order).toEqual(['first', 'second']);
	});

	it('reports a hook that throws instead of failing the boot', async () => {
		const reports = await runWorkspaceReconciliation(
			[
				plugin('broken', async () => {
					throw new Error('database is locked');
				}),
			],
			input,
		);

		// The reconciliation exists to REPAIR a workspace. Letting a
		// broken repair stop the server takes away the only tool the
		// operator has left.
		expect(reports[0]?.outcome.status).toBe('not-executable');
		expect(reports[0]?.outcome.summary).toContain('database is locked');
	});

	it('treats anything short of reconciled as degraded', async () => {
		const degraded = [
			{
				plugin: 'a',
				outcome: { status: 'degraded' as const, summary: 'x' },
			},
		];
		const executable = [
			{
				plugin: 'a',
				outcome: { status: 'reconciled' as const, summary: 'x' },
			},
		];

		// A DEGRADED workspace announced as operational is the failure
		// this whole subsystem exists to prevent.
		expect(isWorkspaceDegraded(degraded)).toBe(true);
		expect(isWorkspaceDegraded(executable)).toBe(false);
	});

	it('names the plugin in what the operator reads', async () => {
		const text = renderReconciliationReports([
			{
				plugin: 'proposals-sqlite',
				outcome: {
					status: 'degraded',
					summary: 'two work refs claim one slice',
					details: ['wip/a/p-s-g1', 'wip/b/p-s-g1'],
				},
			},
		]);

		expect(text).toContain('reconcile(proposals-sqlite): degraded');
		expect(text).toContain('wip/b/p-s-g1');
	});
	it('survives a hook that throws something that is not an Error', async () => {
		const reports = await runWorkspaceReconciliation(
			[
				plugin('rude', async () => {
					// Third-party code, so this is not hypothetical: a
					// plugin may reject with a string, a number, or a
					// plain object, and `error.message` on any of those
					// throws INSIDE the handler meant to contain it.
					throw 'no database here';
				}),
			],
			input,
		);

		expect(reports[0]?.outcome.status).toBe('not-executable');
		expect(reports[0]?.outcome.summary).toContain('no database here');
	});

	it('renders an outcome that carries no details', async () => {
		const text = renderReconciliationReports([
			{
				plugin: 'terse',
				outcome: { status: 'reconciled', summary: 'nothing to repair' },
			},
		]);

		// One line, and no stray blank one underneath: `details` is
		// optional and most healthy runs will not have any.
		expect(text).toBe(
			'[delendai] reconcile(terse): reconciled — nothing to repair',
		);
	});
});
