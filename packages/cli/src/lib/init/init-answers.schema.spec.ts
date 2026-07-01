/**
 * f00084 S1 — `IInitAnswers` Zod schema acceptance spec.
 */
import { describe, expect, it } from 'vitest';

import { INIT_VALID_PLUGIN_IDS } from '../../contracts/constants/init-answers.constant';
import { InitAnswers } from './init-answers.schema';
import type { IInitAnswers } from './init-answers.types';

describe('InitAnswers schema (f00084 S1)', () => {
	it('accepts the canonical defaults', () => {
		const parsed = InitAnswers.parse({});
		expect(parsed.preset).toBe('vertex');
		expect(parsed.extraPlugins).toEqual([]);
		expect(parsed.excludedPlugins).toEqual([]);
		expect(parsed.hostInstructions).toBe('append');
		expect(parsed.copyCoreSkills).toBe(true);
		expect(parsed.generateAgentMd).toBe(true);
		expect(parsed.migrateFromLegacy).toBe(true);
		expect(parsed.force).toBe(false);
	});

	it('accepts a fully specified answer set', () => {
		const parsed = InitAnswers.parse({
			preset: 'full',
			extraPlugins: ['audit'],
			excludedPlugins: ['issues'],
			hostInstructions: 'overwrite',
			copyCoreSkills: false,
			generateAgentMd: false,
			migrateFromLegacy: false,
			force: true,
			issuesRepo: 'octo/example',
			webFetchAllowList: ['api.github.com'],
			workspaceRoot: '/tmp/x',
		});
		expect(parsed.preset).toBe('full');
		expect(parsed.extraPlugins).toEqual(['audit']);
		expect(parsed.excludedPlugins).toEqual(['issues']);
		expect(parsed.hostInstructions).toBe('overwrite');
		expect(parsed.issuesRepo).toBe('octo/example');
		expect(parsed.webFetchAllowList).toEqual(['api.github.com']);
	});

	it('rejects unknown plugin ids in extraPlugins', () => {
		expect(() =>
			InitAnswers.parse({ extraPlugins: ['bogus-plugin'] }),
		).toThrow(/Unknown plugin/);
	});

	it('rejects unknown plugin ids in excludedPlugins', () => {
		expect(() =>
			InitAnswers.parse({ excludedPlugins: ['not-a-plugin'] }),
		).toThrow(/Unknown plugin/);
	});

	it('rejects an invalid preset', () => {
		expect(() => InitAnswers.parse({ preset: 'extreme' })).toThrow();
	});

	it('exports the valid plugin id set including audit', () => {
		expect(INIT_VALID_PLUGIN_IDS.has('audit')).toBe(true);
		expect(INIT_VALID_PLUGIN_IDS.has('proposals')).toBe(true);
		expect(INIT_VALID_PLUGIN_IDS.has('git')).toBe(true);
		expect(INIT_VALID_PLUGIN_IDS.has('web-fetch')).toBe(true);
	});
});
