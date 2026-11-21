import { describe, expect, it } from 'vitest';

import {
	requiresBootSweepActivation,
	requiresPolicyStartupActivation,
} from '@delendai/core/lib/cli/assemble-plugins';

describe('requiresPolicyStartupActivation', () => {
	it.each([
		[
			'slice',
			{
				commit: { enabled: true },
				cadence: { triggers: [{ kind: 'slice' }] },
			},
		],
		[
			'interval',
			{
				commit: { enabled: true },
				cadence: { triggers: [{ kind: 'interval' }] },
			},
		],
		['push on commit', { push: { enabled: true, onCommit: true } }],
		['periodic push', { push: { enabled: true, everyNMinutes: 5 } }],
	])(
		'activates configured automatic %s policies before lazy routing',
		(_name, options) => {
			expect(
				requiresPolicyStartupActivation('commit-policy', options),
			).toBe(true);
		},
	);

	it('activates commit-policy when push-on-commit is configured', () => {
		expect(
			requiresPolicyStartupActivation('commit-policy', {
				commit: { enabled: true },
				push: { enabled: true, onCommit: true },
			}),
		).toBe(true);
	});

	it.each([
		[
			'manual commit',
			{
				commit: { enabled: true },
				cadence: { triggers: [{ kind: 'manual' }] },
			},
		],
		[
			'disabled commit',
			{
				commit: { enabled: false },
				cadence: { triggers: [{ kind: 'slice' }] },
			},
		],
		['disabled push', { push: { enabled: false, onCommit: true } }],
		['empty options', {}],
	])('does not activate %s policies', (_name, options) => {
		expect(requiresPolicyStartupActivation('commit-policy', options)).toBe(
			false,
		);
	});

	it('does not apply commit-policy activation rules to another plugin', () => {
		expect(
			requiresPolicyStartupActivation('proposals', {
				commit: { enabled: true },
				cadence: { triggers: [{ kind: 'slice' }] },
			}),
		).toBe(false);
	});
});

describe('requiresBootSweepActivation', () => {
	it('starts the cache plugin whenever a boot sweep is configured', () => {
		// The sweep runs during assembly, but the rules it sweeps come from
		// the cache plugin's register(). Under managed-lazy that never ran
		// at boot, so the configured posture — including the destructive
		// `apply` — was quietly a no-op.
		expect(
			requiresBootSweepActivation('cache', {
				cache: { runOnBoot: 'apply' },
			}),
		).toBe(true);
		expect(
			requiresBootSweepActivation('cache', {
				cache: { runOnBoot: 'dry-run' },
			}),
		).toBe(true);
		// `dry-run` is also the default, so an unconfigured sweep still
		// needs the rules to report anything at all.
		expect(requiresBootSweepActivation('cache', {})).toBe(true);
	});

	it('leaves the plugin lazy when the sweep is switched off', () => {
		expect(
			requiresBootSweepActivation('cache', {
				cache: { runOnBoot: 'off' },
			}),
		).toBe(false);
	});

	it('never starts an unrelated plugin', () => {
		expect(
			requiresBootSweepActivation('proposals', {
				cache: { runOnBoot: 'apply' },
			}),
		).toBe(false);
	});
});
