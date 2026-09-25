import { describe, expect, it } from 'vitest';

import type { IAuthorityDeclaration } from '@delendai/core/public';

import {
	authorityFindings,
	type IAuthorityCheckFacts,
} from './authorities.script';

const declaration: IAuthorityDeclaration = {
	domain: 'bundled-skills',
	authority: 'skills/manifest.json',
	projections: [
		{ path: 'gen/skills.generated.ts', producer: 'tools/gen-skills.ts' },
	],
	rebuild: 'bun run gen:all',
	driftGate: 'gen:all:check',
};

const facts = (
	over: Partial<IAuthorityCheckFacts> = {},
): IAuthorityCheckFacts => ({
	exists: () => true,
	scripts: { 'gen:all': 'x', 'gen:all:check': 'x' },
	reachable: new Set(['gen:all:check']),
	...over,
});

describe('authorityFindings', () => {
	it('finds nothing wrong with a declaration that is true', () => {
		expect(authorityFindings(declaration, facts())).toEqual([]);
	});

	it('fails when a projection’s producer was removed', () => {
		const findings = authorityFindings(
			declaration,
			facts({ exists: (path) => path !== 'tools/gen-skills.ts' }),
		);
		expect(findings).toEqual([
			'authority "bundled-skills": gen/skills.generated.ts is written by tools/gen-skills.ts, which does not exist',
		]);
	});

	it('fails when the drift gate is unwired from CI', () => {
		const findings = authorityFindings(
			declaration,
			facts({ reachable: new Set() }),
		);
		expect(findings.join('\n')).toContain('is never run by CI');
	});

	it('fails on a drift gate or a rebuild that is not a script', () => {
		const findings = authorityFindings(
			{ ...declaration, driftGate: 'lint:gone', rebuild: 'bun run gone' },
			facts(),
		);
		expect(findings).toHaveLength(2);
	});

	it('fails on a missing authority, and does not look up a named store', () => {
		expect(
			authorityFindings(
				declaration,
				facts({ exists: (p) => p !== 'skills/manifest.json' }),
			),
		).toHaveLength(1);
		expect(
			authorityFindings(
				{ ...declaration, authority: 'measurement:tools/list' },
				facts({ exists: (p) => p !== 'measurement:tools/list' }),
			),
		).toEqual([]);
	});
});
