/**
 * authority.interface.spec.ts
 *
 * f00552 S1: a plugin declares which copy of each fact is the truth,
 * and the manifest refuses a declaration that could not be checked.
 */
import { describe, expect, it } from 'vitest';

import {
	definePluginManifest,
	type IAuthorityDeclaration,
} from '@delendai/core/public';

const base = {
	id: 'proposals' as const,
	package: '@delendai/proposals' as const,
	version: '0.1.1',
	visibility: 'public' as const,
	summary: 'Proposal lifecycle for delendai projects.',
	tags: ['proposals'],
	maturity: 'beta' as const,
	permissions: ['network' as const],
	presets: ['swarm'],
	tokenBudget: 1024,
	dependencies: ['@delendai/core'],
	capabilities: ['proposals'],
};

const status: IAuthorityDeclaration = {
	domain: 'proposal-status',
	authority: 'docs/delendai/proposals',
	projections: [
		{
			path: 'docs/delendai/agent-catalog.generated.json',
			producer:
				'tools/scripts/proposals/sync-proposal-registry.script.ts',
		},
	],
	rebuild: 'bun run sync:proposals',
	driftGate: 'lint:proposals',
};

const refusal = (authorities: IAuthorityDeclaration[]): string => {
	try {
		definePluginManifest({ ...base, authorities });
	} catch (error) {
		return String(error);
	}
	return 'accepted';
};

describe('authorities in a plugin manifest', () => {
	it('is optional', () => {
		expect(() => definePluginManifest(base)).not.toThrow();
	});

	it('keeps a declaration with its authority, projections and gates', () => {
		const manifest = definePluginManifest({
			...base,
			authorities: [status],
		});
		expect(manifest.authorities).toEqual([status]);
	});

	it('refuses a fact with no projection, since it has no second copy', () => {
		expect(refusal([{ ...status, projections: [] }])).toContain(
			'no projection',
		);
	});

	it('refuses a projection that is the authority itself', () => {
		expect(
			refusal([
				{
					...status,
					projections: [{ path: status.authority, producer: 'x' }],
				},
			]),
		).toContain('cannot be the authority itself');
	});

	it('refuses the same projection twice and the same domain twice', () => {
		const [projection] = status.projections;
		if (projection === undefined) throw new Error('no projection');
		expect(
			refusal([{ ...status, projections: [projection, projection] }]),
		).toContain('declared twice');
		expect(refusal([status, status])).toMatch(
			/domain \\"proposal-status\\" is declared twice/u,
		);
	});

	it('refuses an absolute projection path and a producer left blank', () => {
		expect(
			refusal([
				{ ...status, projections: [{ path: '/etc/x', producer: 'x' }] },
			]),
		).toContain('relative repo path');
		expect(
			refusal([
				{ ...status, projections: [{ path: 'a.json', producer: ' ' }] },
			]),
		).toContain('producer must not be empty');
	});

	it('refuses a drift gate that is not a script name', () => {
		expect(
			refusal([{ ...status, driftGate: 'bun run lint:proposals' }]),
		).toContain('script name');
	});
});
