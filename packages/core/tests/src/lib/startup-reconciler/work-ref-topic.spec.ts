/**
 * work-ref-topic.spec.ts — a work ref names its model and its purpose.
 *
 * A branch named `delendai/wip/DESKTOP-9CTQRS7/x00545-S0-g1` told a
 * person reading Git Graph which MACHINE did the work and nothing about
 * what it was. The template now carries the exact model as `${agent}`
 * and a descriptive `${topic}`, and these cases pin both directions:
 * the ref a writer produces, and the identity a reader recovers — for
 * new refs and for every ref written before the topic existed.
 */
import { describe, expect, it } from 'vitest';

import { resolveDevelopmentPolicy } from '@delendai/core/lib/development-policy/resolve';
import { compileWorkRefParser } from '@delendai/core/lib/startup-reconciler/work-ref-identity';
import { resolveWorkRef } from '@delendai/core/lib/wip-engine/ref-name';

const branches = resolveDevelopmentPolicy({
	development: {
		profile: 'shared-checkout-pr',
		branches: { namespacePrefix: 'delendai' },
	},
}).branches;
const parser = compileWorkRefParser(
	branches.workRefTemplate,
	branches.workRefPrefix,
);

describe('work refs carry the model and what the work is', () => {
	it('names the ref after the exact model and the topic', () => {
		expect(
			resolveWorkRef(branches.workRefTemplate, {
				agent: 'claude-opus-5',
				proposal: 'x00546',
				slice: 'S1',
				generation: 1,
				topic: 'configurable-ref-namespace',
			}),
		).toBe(
			'refs/heads/delendai/wip/claude-opus-5/x00546-S1-g1-configurable-ref-namespace',
		);
	});

	it('recovers every field, even with hyphens inside the topic', () => {
		expect(
			parser?.parse(
				'refs/heads/delendai/wip/claude-opus-5/x00546-S1-g12-configurable-ref-namespace',
			),
		).toEqual({
			agent: 'claude-opus-5',
			proposal: 'x00546',
			slice: 'S1',
			generation: 12,
			topic: 'configurable-ref-namespace',
		});
	});

	it('still attributes a ref written before the template had a topic', () => {
		// Otherwise one upgrade makes existing work unattributable.
		expect(
			parser?.parse('refs/heads/delendai/wip/claude-opus-5/x00546-S1-g3'),
		).toEqual({
			agent: 'claude-opus-5',
			proposal: 'x00546',
			slice: 'S1',
			generation: 3,
		});
	});

	it('falls back to a readable topic instead of `unnamed`', () => {
		expect(
			resolveWorkRef(branches.workRefTemplate, {
				agent: 'claude-opus-5',
				proposal: 'x00546',
				slice: 'S1',
				generation: 2,
			}),
		).toBe('refs/heads/delendai/wip/claude-opus-5/x00546-S1-g2-work');
	});

	it('sanitises a topic written as prose', () => {
		expect(
			resolveWorkRef(branches.workRefTemplate, {
				agent: 'claude-opus-5',
				proposal: 'x00546',
				slice: 'S1',
				generation: 1,
				topic: 'fix the ref guard: namespaces!',
			}),
		).toBe(
			'refs/heads/delendai/wip/claude-opus-5/x00546-S1-g1-fix-the-ref-guard-namespaces',
		);
	});

	it('does not attribute a ref that is not shaped like work at all', () => {
		expect(
			parser?.parse('refs/heads/delendai/wip/mystery'),
		).toBeUndefined();
	});
});
