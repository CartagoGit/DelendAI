/**
 * identity-policy.spec.ts — what the project's identity axis does to a
 * resolved identity (f00758).
 */
import { describe, expect, it } from 'vitest';

import { applyIdentityPolicy } from '@delendai/core/lib/work-identity/identity-policy.helper';
import { WORK_AGENT_UNKNOWN } from '@delendai/core/lib/work-identity/resolve-work-agent.service';

const id = (
	id: string,
	source: 'model' | 'environment' | 'provider' | 'client' | 'none',
) => ({ id, source }) as const;

describe('applyIdentityPolicy', () => {
	it('is inert without an axis', () => {
		expect(
			applyIdentityPolicy(id('gpt-5.6-sol', 'provider'), undefined),
		).toEqual(id('gpt-5.6-sol', 'provider'));
		// A client name keeps its marked id too: only a project that RULES
		// on identity changes what a name counts as.
		expect(
			applyIdentityPolicy(
				id('client-visual-studio-code', 'client'),
				undefined,
			),
		).toEqual(id('client-visual-studio-code', 'client'));
		expect(
			applyIdentityPolicy(id(WORK_AGENT_UNKNOWN, 'none'), undefined)
				.source,
		).toBe('none');
	});

	it('never touches a declared model identity', () => {
		for (const identity of [
			id('claude-opus-5', 'model'),
			id('minimax-m3.1', 'environment'),
		]) {
			expect(
				applyIdentityPolicy(identity, {
					providerBridge: false,
					unrecognizedModel: { use: 'shared-agent' },
				}),
			).toEqual(identity);
		}
	});

	it('stops counting an observed model when the bridge is closed', () => {
		expect(
			applyIdentityPolicy(id('gpt-5.6-sol', 'provider'), {
				providerBridge: false,
			}).source,
		).toBe('none');
		// …and the project's default names it when one is declared.
		expect(
			applyIdentityPolicy(id('gpt-5.6-sol', 'provider'), {
				providerBridge: false,
				unrecognizedModel: { use: 'shared-agent' },
			}),
		).toEqual({ id: 'shared-agent', source: 'policy' });
	});

	it('names a client identity with the project default, never as a model', () => {
		// A client name is an application; renaming keeps the `client-`
		// marker off only because the axis replaces the name entirely —
		// what the ref carries is the project's own word.
		expect(
			applyIdentityPolicy(id('client-visual-studio-code', 'client'), {
				unrecognizedModel: { use: 'Shared Agent' },
			}),
		).toEqual({ id: 'shared-agent', source: 'policy' });
		expect(
			applyIdentityPolicy(id('client-visual-studio-code', 'client'), {
				unrecognizedModel: 'refuse',
			}).source,
		).toBe('none');
	});

	it('degrades an unusable rename to the refusal', () => {
		// Validate refuses this shape at startup; if it ever reaches here,
		// the answer is nobody, never an empty ref component.
		expect(
			applyIdentityPolicy(id(WORK_AGENT_UNKNOWN, 'none'), {
				unrecognizedModel: { use: '!!!' },
			}).source,
		).toBe('none');
	});
});
