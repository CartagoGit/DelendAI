import { describe, expect, it } from 'vitest';

import {
	buildSkillPromptRegistrations,
	skillPromptSlug,
} from '@delendai/core/lib/prompts/skill-prompts';
import type {
	ISkillCatalog,
	ISkillCatalogEntry,
} from '@delendai/core/lib/skills/skill-catalog';

const entry = (over: Partial<ISkillCatalogEntry> = {}): ISkillCatalogEntry => ({
	id: 'delendai-operator',
	version: '1.0.0',
	minCoreVersion: '0.1.0',
	description: 'What it is and when to use it.',
	appliesTo: ['@delendai/*'],
	tags: ['orientation'],
	bodyPath: 'packages/core/skills/delendai-operator/SKILL.md',
	...over,
});

const catalogOf = (
	entries: readonly ISkillCatalogEntry[],
	bodies: Record<string, string> = {},
): ISkillCatalog => ({
	entries,
	loadBody: async (id) => bodies[id],
});

/** Minimal McpServer stand-in capturing `registerPrompt` calls. */
const fakeServer = () => {
	const calls: Array<{
		name: string;
		def: { description?: string };
		handler: () => Promise<{
			messages: Array<{ content: { type: string; text: string } }>;
		}>;
	}> = [];
	const server = {
		registerPrompt: (
			name: string,
			def: { description?: string },
			handler: unknown,
		) => {
			calls.push({
				name,
				def,
				handler: handler as (typeof calls)[number]['handler'],
			});
		},
	};
	return { server, calls };
};

describe('skillPromptSlug', () => {
	it('lowercases and collapses non-alphanumerics to underscores', () => {
		expect(skillPromptSlug('delendai-operator')).toBe('delendai_operator');
		expect(skillPromptSlug('Proposals Workflow!Playbook')).toBe(
			'proposals_workflow_playbook',
		);
	});
});

describe('buildSkillPromptRegistrations', () => {
	it('produces one registration per skill with a unique, namespaced name', async () => {
		const catalog = catalogOf([
			entry({ id: 'delendai-operator' }),
			entry({
				id: 'proposals-workflow-playbook',
				description: 'Run swarms.',
			}),
		]);
		const regs = buildSkillPromptRegistrations('delendai', () => catalog);
		expect(regs.map((r) => r.id)).toEqual([
			'skill_delendai_operator',
			'skill_proposals_workflow_playbook',
		]);

		const { server, calls } = fakeServer();
		for (const reg of regs) await reg.register(server as never);

		expect(calls.map((c) => c.name)).toEqual([
			'delendai_skill_delendai_operator',
			'delendai_skill_proposals_workflow_playbook',
		]);
		// The description shown under `/` is the skill's one-liner.
		expect(calls[1]?.def.description).toBe('Run swarms.');
	});

	it('loads the skill body lazily on invocation', async () => {
		const catalog = catalogOf([entry({ id: 'delendai-operator' })], {
			'delendai-operator': '# Operator\n\nDo the thing.',
		});
		const [reg] = buildSkillPromptRegistrations('delendai', () => catalog);
		const { server, calls } = fakeServer();
		await reg?.register(server as never);

		const result = await calls[0]?.handler();
		expect(result?.messages[0]?.content.text).toBe(
			'# Operator\n\nDo the thing.',
		);
	});

	it('falls back to a clear message when a body is missing', async () => {
		const catalog = catalogOf([entry({ id: 'delendai-operator' })]);
		const [reg] = buildSkillPromptRegistrations('delendai', () => catalog);
		const { server, calls } = fakeServer();
		await reg?.register(server as never);

		const result = await calls[0]?.handler();
		expect(result?.messages[0]?.content.text).toContain(
			'could not be loaded',
		);
	});
});
