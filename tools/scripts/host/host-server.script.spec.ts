import { existsSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it, vi } from 'vitest';

import {
	catchUpAtBoot,
	INTEGRATION_FOLLOW_UPS_SCRIPT,
	createStopHandler,
	describeMigrationRun,
	hasHelpFlag,
	HYDRATION_INTERVAL_ENV,
	hydrationIntervalMs,
	resolveWorkspaceFlag,
} from './host-server.script';

describe('hasHelpFlag', () => {
	it('[<50ms] recognizes long and short help flags', () => {
		expect(hasHelpFlag(['--help'])).toBe(true);
		expect(hasHelpFlag(['-h'])).toBe(true);
	});

	it('[<50ms] does not treat unrelated flags as help', () => {
		expect(hasHelpFlag(['--workspace=/tmp/x'])).toBe(false);
	});
});

// x00186 (F27): pure unit coverage for the argv parsing this entrypoint
// uses to resolve `--workspace` before falling back to cwd/env. The e2e
// spawn tests in host-graceful-shutdown.spec.ts cover the full boot path.
describe('resolveWorkspaceFlag', () => {
	it('[<50ms] reads the `=` form', () => {
		expect(
			resolveWorkspaceFlag(['--workspace=/tmp/x', '--preset=lean']),
		).toBe('/tmp/x');
	});

	it('[<50ms] reads the space-separated form', () => {
		expect(resolveWorkspaceFlag(['--workspace', '/tmp/x'])).toBe('/tmp/x');
	});

	it('[<50ms] returns undefined when the flag is absent', () => {
		expect(resolveWorkspaceFlag(['--preset=lean'])).toBeUndefined();
	});

	it('[<50ms] returns undefined when --workspace is the last token with no value', () => {
		expect(
			resolveWorkspaceFlag(['--preset=lean', '--workspace']),
		).toBeUndefined();
	});

	it('[<50ms] prefers the first occurrence when passed twice', () => {
		expect(
			resolveWorkspaceFlag(['--workspace=/first', '--workspace=/second']),
		).toBe('/first');
	});
});

describe('hydrationIntervalMs', () => {
	it('[<50ms] defers to core when the operator said nothing', () => {
		// `undefined` is not "off": it means the cadence is core's to
		// choose, so the default lives in one place instead of two.
		expect(hydrationIntervalMs({})).toBeUndefined();
	});

	it('[<50ms] honours an explicit interval', () => {
		expect(hydrationIntervalMs({ [HYDRATION_INTERVAL_ENV]: '5000' })).toBe(
			5000,
		);
	});

	it('[<50ms] treats 0 as off, because that is a decision', () => {
		expect(hydrationIntervalMs({ [HYDRATION_INTERVAL_ENV]: '0' })).toBe(0);
	});

	it('[<80ms] falls back to the default on an unreadable value, never to silence', () => {
		// "off" has to be something somebody chose. A typo that turned
		// the background refresh off would reproduce the exact bug this
		// watch exists to fix, and leave no trace of why.
		for (const raw of ['abc', '-1', '']) {
			expect(
				hydrationIntervalMs({ [HYDRATION_INTERVAL_ENV]: raw }),
			).toBeUndefined();
		}
	});
});

describe('describeMigrationRun', () => {
	it('[<50ms] says nothing when nothing happened', () => {
		expect(
			describeMigrationRun({
				outcomes: [{ status: 'not-needed' }],
				acted: false,
			}),
		).toEqual([]);
	});

	it('[<50ms] names a migration that ran and one that failed', () => {
		expect(
			describeMigrationRun({
				outcomes: [
					{ status: 'migrated', id: 'v1' },
					{ status: 'failed', id: 'v2', reason: 'locked' },
				],
				acted: true,
			}),
		).toEqual(['migrated: v1', 'migration failed: v2 — locked']);
	});

	it('[<50ms] prints every applied configuration step, one per line', () => {
		expect(
			describeMigrationRun({
				outcomes: [],
				acted: true,
				transitions: {
					previousSource: 'recorded',
					acted: true,
					recorded: 'unchanged',
					recordPath: '.delendai/applied-config.json',
					outcomes: [
						{
							status: 'applied',
							id: 'config:cache-dir',
							steps: [{ kind: 'move-cache', detail: 'a -> b' }],
						},
						{
							status: 'failed',
							id: 'config:x',
							reason: 'disk full',
						},
					],
				},
			}),
		).toEqual([
			'config: move-cache a -> b',
			'config change failed: config:x — disk full',
		]);
	});

	it('[<50ms] explains why no configuration change was attempted', () => {
		// An operator whose edit "did nothing" needs to hear that the
		// file was refused, not silence.
		const [line] = describeMigrationRun({
			outcomes: [],
			acted: false,
			transitions: {
				previousSource: 'recorded',
				acted: false,
				recorded: 'withheld',
				recordPath: '.delendai/applied-config.json',
				outcomes: [],
				skipped: 'delendai.config.json has problems (x)',
			},
		});
		expect(line).toContain('has problems');
	});

	it('[<50ms] names the one file it created in a project that changed nothing else (x00607)', () => {
		// The directory holding it is self-ignoring, so `git status` in
		// that project shows nothing. If the report is silent too, the
		// owner has no way to learn the file exists.
		expect(
			describeMigrationRun({
				outcomes: [],
				acted: true,
				transitions: {
					previousSource: 'inferred',
					acted: true,
					recorded: 'written',
					recordPath: '.delendai/applied-config.json',
					outcomes: [],
				},
			}),
		).toStrictEqual([
			"config: recorded this workspace's configuration in .delendai/applied-config.json — so a later edit to it can be acted on",
		]);
	});

	it('[<50ms] says nothing about a record that already matched (x00607)', () => {
		expect(
			describeMigrationRun({
				outcomes: [],
				acted: false,
				transitions: {
					previousSource: 'recorded',
					acted: false,
					recorded: 'unchanged',
					recordPath: '.delendai/applied-config.json',
					outcomes: [],
				},
			}),
		).toStrictEqual([]);
	});
});

describe('createStopHandler', () => {
	it('[<50ms] stops cleanly when a signal lands before anything has started', () => {
		const shutdown = vi.fn();
		const targets = {};
		expect(() => createStopHandler(targets, shutdown)(143)).not.toThrow();
		expect(shutdown).toHaveBeenCalledWith(143);
	});

	it('[<90ms] stops what has started by the time the signal arrives', () => {
		const shutdown = vi.fn();
		const maintenance = { stop: vi.fn() };
		const hydration = { stop: vi.fn() };
		const forgeEvents = { stop: vi.fn() };
		const targets: Parameters<typeof createStopHandler>[0] = {};
		const handler = createStopHandler(targets, shutdown);
		targets.maintenance = maintenance;
		targets.hydration = hydration;
		targets.forgeEvents = forgeEvents;
		handler(130);
		expect(maintenance.stop).toHaveBeenCalledOnce();
		expect(hydration.stop).toHaveBeenCalledOnce();
		expect(forgeEvents.stop).toHaveBeenCalledOnce();
		expect(shutdown).toHaveBeenCalledWith(130);
	});
});

describe('INTEGRATION_FOLLOW_UPS_SCRIPT', () => {
	it('[<20ms] names the one script the server runs, read from the checkout', () => {
		const root = join(import.meta.dirname, '../../..');
		expect(existsSync(join(root, INTEGRATION_FOLLOW_UPS_SCRIPT))).toBe(
			true,
		);
	});
});

describe('catchUpAtBoot', () => {
	it('[<20ms] runs the follow-ups once when this server maintains the workspace', async () => {
		const followUp = vi.fn(async () => undefined);
		const report = vi.fn();
		await catchUpAtBoot({
			standDown: async () => undefined,
			followUp,
			report,
		});
		expect(followUp).toHaveBeenCalledOnce();
		expect(report).not.toHaveBeenCalled();
	});

	it('[<20ms] leaves them to the maintainer, and says why, when it stands down', async () => {
		const followUp = vi.fn(async () => undefined);
		const report = vi.fn();
		await catchUpAtBoot({
			standDown: async () => 'Server h#1#a maintains this workspace.',
			followUp,
			report,
		});
		expect(followUp).not.toHaveBeenCalled();
		expect(report).toHaveBeenCalledWith(
			'follow-ups not caught up at boot: Server h#1#a maintains this workspace.',
		);
	});
});
