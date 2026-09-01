import { describe, expect, it } from 'vitest';

import { requiresPolicyStartupActivation } from '@mcp-vertex/core/lib/cli/assemble-plugins';

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
