import { describe, expect, it } from 'vitest';

import type { ICapabilityGraph } from '../../src/capability-graph.interface';

const POLYGLOT_PROJECT = {
	contract: 'delendai.capability-graph',
	version: 1,
	languages: [
		{
			id: 'typescript',
			signals: [
				{
					source: 'detect-stack',
					value: 'typescript',
					evidence: 'tsconfig.json',
					confidence: 'strong',
				},
			],
		},
		{
			id: 'rust',
			signals: [
				{
					source: 'language-rules',
					value: 'rust',
					evidence: 'Cargo.toml',
					confidence: 'certain',
				},
			],
		},
	],
	primaryLanguage: 'typescript',
	shape: {
		workspace: 'polyglot-workspace',
		roles: [
			{
				role: 'web-client',
				signals: [
					{
						source: 'framework-rules',
						value: 'web-client',
						evidence: 'package.json#dependencies.astro',
						confidence: 'strong',
					},
				],
			},
			{
				role: 'cli',
				signals: [
					{
						source: 'role-rules',
						value: 'cli',
						evidence: 'crates/vertex-cli/src/main.rs',
						confidence: 'strong',
					},
				],
			},
		],
	},
	signals: [
		{
			source: 'package-manager-rules',
			value: 'bun',
			evidence: 'bun.lock',
			confidence: 'certain',
		},
	],
} as const satisfies ICapabilityGraph;

describe('capability graph contract', () => {
	it('represents plural languages and roles with traceable evidence', () => {
		expect(POLYGLOT_PROJECT.contract).toBe('delendai.capability-graph');
		expect(POLYGLOT_PROJECT.version).toBe(1);
		expect(POLYGLOT_PROJECT.languages.map(({ id }) => id)).toEqual([
			'typescript',
			'rust',
		]);
		expect(POLYGLOT_PROJECT.shape.roles.map(({ role }) => role)).toEqual([
			'web-client',
			'cli',
		]);
		expect(POLYGLOT_PROJECT.languages[0]?.signals[0]?.evidence).toBe(
			'tsconfig.json',
		);
	});

	it('permits an honest empty result when no detector has evidence', () => {
		const unknownProject = {
			contract: 'delendai.capability-graph',
			version: 1,
			languages: [],
			primaryLanguage: undefined,
			shape: { workspace: 'unknown', roles: [] },
			signals: [],
		} as const satisfies ICapabilityGraph;

		expect(unknownProject.languages).toEqual([]);
		expect(unknownProject.shape.roles).toEqual([]);
	});
});
