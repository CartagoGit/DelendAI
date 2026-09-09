/**
 * ref-name.spec.ts — the policy template is operator-controlled and the
 * values interpolated into it are not, so these tests pin the property
 * that matters for durability: whatever an agent id or slice name
 * contains, the expansion is still a ref git will accept, and it is never
 * a branch.
 */

import { describe, expect, it } from 'vitest';

import {
	expandWorkRefTemplate,
	resolveWorkRef,
	sanitizeRefComponent,
} from '@delendai/core/lib/wip-engine/ref-name';

const DEFAULT_TEMPLATE = 'wip/${agent}/${proposal}-${slice}-g${generation}';

describe('resolveWorkRef', () => {
	it('expands every placeholder of the shipped default template', () => {
		expect(
			resolveWorkRef(DEFAULT_TEMPLATE, {
				agent: 'implementation-runner',
				proposal: 'f00418',
				slice: 's3',
				generation: 2,
			}),
		).toBe('refs/wip/implementation-runner/f00418-s3-g2');
	});

	it('keeps a fully-qualified template as it is', () => {
		expect(
			resolveWorkRef('refs/delendai/wip/${agent}-g${generation}', {
				agent: 'a',
				proposal: 'p',
				slice: 's',
				generation: '1',
			}),
		).toBe('refs/delendai/wip/a-g1');
	});

	it('never places a work ref under refs/heads — a WIP ref is not a branch', () => {
		expect(
			resolveWorkRef(DEFAULT_TEMPLATE, {
				agent: 'a',
				proposal: 'p',
				slice: 's',
				generation: 1,
			}).startsWith('refs/heads/'),
		).toBe(false);
	});

	it('sanitises values git would reject', () => {
		expect(sanitizeRefComponent('feature/one two~three')).toBe(
			'feature-one-two-three',
		);
		expect(sanitizeRefComponent('..leading')).toBe('leading');
		expect(sanitizeRefComponent('   ')).toBe('unnamed');
		expect(
			resolveWorkRef(DEFAULT_TEMPLATE, {
				agent: 'agent one',
				proposal: 'f 1',
				slice: 'slice:2',
				generation: 1,
			}),
		).toBe('refs/wip/agent-one/f-1-slice-2-g1');
	});

	it('leaves an unknown placeholder visible instead of blanking it', () => {
		expect(
			expandWorkRefTemplate('wip/${agent}/${unknown}', {
				agent: 'a',
				proposal: 'p',
				slice: 's',
				generation: 1,
			}),
		).toBe('wip/a/${unknown}');
	});
});
