/**
 * preset-marginal-ceiling.spec.ts — the ceiling is a boundary, core is
 * not a plugin, and "nothing measured" is not a pass.
 */
import { describe, expect, it } from 'vitest';

import { heaviestPlugin, marginalVerdict } from './preset-marginal-ceiling';

const CEILING = { hard: 11_000, warning: 9_500 };

describe('heaviestPlugin', () => {
	it('picks the largest owner and never counts core', () => {
		expect(
			heaviestPlugin([
				{ owner: 'core', toolsListBytes: 43_805 },
				{ owner: 'memory', toolsListBytes: 8_202 },
				{ owner: 'agent-orchestrator', toolsListBytes: 11_167 },
			]),
		).toEqual({ owner: 'agent-orchestrator', toolsListBytes: 11_167 });
	});

	it('answers undefined when only core is listed', () => {
		expect(
			heaviestPlugin([{ owner: 'core', toolsListBytes: 6_143 }]),
		).toBeUndefined();
	});
});

describe('marginalVerdict', () => {
	it('breaches one byte over the hard ceiling', () => {
		// Measured on develop, 2026-09-15: `standard`, agent-orchestrator.
		expect(
			marginalVerdict(
				[{ owner: 'agent-orchestrator', toolsListBytes: 11_001 }],
				CEILING,
			),
		).toMatchObject({
			kind: 'over-hard',
			owner: 'agent-orchestrator',
			bytes: 11_001,
		});
	});

	it('does not breach at exactly the hard ceiling', () => {
		expect(
			marginalVerdict(
				[{ owner: 'memory', toolsListBytes: 11_000 }],
				CEILING,
			).kind,
		).toBe('over-warning');
	});

	it('is within the ceiling at or under the warning', () => {
		expect(
			marginalVerdict(
				[{ owner: 'memory', toolsListBytes: 9_500 }],
				CEILING,
			).kind,
		).toBe('within');
	});

	it('names a surface with no plugin tools instead of passing it at 0 B', () => {
		// The adaptive surface lists core tools only. The e2e marginal
		// cases measured exactly that and could therefore never fail.
		expect(
			marginalVerdict(
				[{ owner: 'core', toolsListBytes: 6_143 }],
				CEILING,
			),
		).toEqual({ kind: 'no-plugins' });
	});
});
