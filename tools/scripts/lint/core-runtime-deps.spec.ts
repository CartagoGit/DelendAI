import { describe, expect, it } from 'vitest';

import {
	ALLOWED_CORE_RUNTIME_DEPENDENCIES,
	checkCoreDependencies,
} from './core-runtime-deps.script';

const allowed = { a: 'because a', b: 'because b' } as const;

describe('core-runtime-deps', () => {
	describe('what it refuses', () => {
		it('flags a dependency nobody decided to allow', () => {
			// Every consumer of the core inherits it, which is the whole
			// reason the boundary is worth guarding.
			const violations = checkCoreDependencies(
				{ a: '1', b: '1', lodash: '4' },
				allowed,
			);

			expect(violations).toHaveLength(1);
			expect(violations[0]?.name).toBe('lodash');
			expect(violations[0]?.kind).toBe('not-allowed');
			expect(violations[0]?.detail).toContain('architectural decision');
		});

		it('flags an allowance the core no longer uses', () => {
			// Decay in the other direction: a stale entry quietly widens
			// what the gate permits.
			const violations = checkCoreDependencies({ a: '1' }, allowed);

			expect(violations).toHaveLength(1);
			expect(violations[0]?.name).toBe('b');
			expect(violations[0]?.kind).toBe('allowed-but-absent');
		});

		it('reports both directions at once rather than stopping at the first', () => {
			expect(
				checkCoreDependencies({ a: '1', chalk: '5' }, allowed).map(
					(violation) => violation.name,
				),
			).toEqual(['chalk', 'b']);
		});
	});

	describe('what it accepts', () => {
		it('accepts exactly the allowed set', () => {
			expect(checkCoreDependencies({ a: '1', b: '2' }, allowed)).toEqual(
				[],
			);
		});

		it('ignores the version, which is not what this gate is about', () => {
			expect(
				checkCoreDependencies(
					{ a: 'workspace:*', b: '^9.9.9' },
					allowed,
				),
			).toEqual([]);
		});
	});

	describe('the real allow-list', () => {
		it('gives every entry a reason, so the list stays reviewable', () => {
			for (const [name, reason] of Object.entries(
				ALLOWED_CORE_RUNTIME_DEPENDENCIES,
			)) {
				expect(reason.length, name).toBeGreaterThan(20);
			}
		});

		it('covers what the architecture document used to claim', () => {
			expect(ALLOWED_CORE_RUNTIME_DEPENDENCIES).toHaveProperty(
				'@modelcontextprotocol/sdk',
			);
			expect(ALLOWED_CORE_RUNTIME_DEPENDENCIES).toHaveProperty('zod');
		});
	});
});
