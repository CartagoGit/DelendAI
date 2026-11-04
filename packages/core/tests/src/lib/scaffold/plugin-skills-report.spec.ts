import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	symlinkSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
	createPluginSkillSurfaceSync,
	installPluginSkills,
	reportPluginSkills,
} from '../../../../src/lib/scaffold/plugin-skills-report';

describe('plugin skills at start and at init', () => {
	let root: string;
	beforeEach(() => {
		root = mkdtempSync(join(tmpdir(), 'plugin-skills-report-'));
		// The plugin as a consumer has it: installed under node_modules.
		mkdirSync(join(root, 'node_modules/@delendai'), { recursive: true });
		symlinkSync(
			resolve(import.meta.dirname, '../../../../../../plugins/proposals'),
			join(root, 'node_modules/@delendai/proposals'),
		);
	});
	afterEach(() => {
		rmSync(root, { recursive: true, force: true });
	});

	it('reports each skill it installs, and stays silent the second time', async () => {
		const lines: string[] = [];
		const catalog = {
			entries: [
				{
					id: 'demo-skill',
					version: '1.0.0',
					minCoreVersion: '0.0.0',
					description: 'demo',
					appliesTo: ['@delendai/demo'],
					tags: [],
					bodyPath: 'demo-skill/SKILL.md',
				},
			],
			loadBody: async () => '---\nname: demo-skill\n---\n\nBody\n',
		};

		await reportPluginSkills(root, catalog, ['demo'], ['claude'], (l) =>
			lines.push(l),
		);
		await reportPluginSkills(root, catalog, ['demo'], ['claude'], (l) =>
			lines.push(l),
		);

		expect(lines).toEqual([
			'[delendai] skill .claude/skills/demo-skill/SKILL.md (plugin demo) installed.\n',
		]);
	});

	it('installs the skills a plugin package ships for the declared hosts', async () => {
		const changes = await installPluginSkills({
			root,
			pluginNames: ['proposals'],
			declaredHosts: ['claude', 'codex'],
		});

		const claude = changes.filter((c) =>
			c.path.startsWith('.claude/skills/'),
		);
		const codex = changes.filter((c) =>
			c.path.startsWith('.agents/skills/'),
		);
		expect(claude.length).toBeGreaterThan(0);
		expect(codex).toHaveLength(claude.length);
		expect(changes.every((c) => c.action === 'created')).toBe(true);
		expect(
			readFileSync(join(root, claude[0]?.path ?? ''), 'utf8'),
		).toContain('<!-- delendai:plugin-skill plugin=proposals');
		expect(existsSync(join(root, '.github/skills'))).toBe(false);
	});

	it("installs a plugin's skills when it is activated and removes them when it is deactivated", async () => {
		const catalog = {
			entries: [
				{
					id: 'demo-skill',
					version: '1.0.0',
					minCoreVersion: '0.0.0',
					description: 'demo',
					appliesTo: ['@delendai/demo'],
					tags: [],
					bodyPath: 'demo-skill/SKILL.md',
				},
			],
			loadBody: async () => '---\nname: demo-skill\n---\n\nBody\n',
		};
		const file = join(root, '.claude/skills/demo-skill/SKILL.md');
		const sync = createPluginSkillSurfaceSync({
			root,
			catalog,
			initial: [],
			declaredHosts: ['claude'],
			write: () => undefined,
		});

		await sync('demo', true);
		expect(existsSync(file)).toBe(true);
		await sync('@delendai/demo', false);
		expect(existsSync(file)).toBe(false);
	});
});
