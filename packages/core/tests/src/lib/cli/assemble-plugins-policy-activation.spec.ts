import { describe, expect, it } from 'vitest';

import { requiresPolicyStartupActivation } from '@mcp-vertex/core/lib/cli/assemble-plugins';

describe('requiresPolicyStartupActivation', () => {
	it('activates configured automatic commit-policy triggers before lazy routing', () => {
		expect(
			requiresPolicyStartupActivation('commit-policy', {
				commit: { enabled: true },
				cadence: { triggers: [{ kind: 'slice' }] },
			}),
		).toBe(true);
	});

	it('activates commit-policy when push-on-commit is configured', () => {
		expect(
			requiresPolicyStartupActivation('commit-policy', {
				commit: { enabled: true },
				push: { enabled: true, onCommit: true },
			}),
		).toBe(true);
	});

	it('activates commit-policy for periodic automatic pushes', () => {
		expect(
			requiresPolicyStartupActivation('commit-policy', {
				push: { enabled: true, everyNMinutes: 5 },
			}),
		).toBe(true);
	});

	it('does not activate manual-only or disabled policies', () => {
		expect(
			requiresPolicyStartupActivation('commit-policy', {
				commit: { enabled: true },
				cadence: { triggers: [{ kind: 'manual' }] },
			}),
		).toBe(false);
		expect(
			requiresPolicyStartupActivation('commit-policy', {
				commit: { enabled: false },
				cadence: { triggers: [{ kind: 'slice' }] },
			}),
		).toBe(false);
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
