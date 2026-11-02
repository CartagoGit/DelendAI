import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { AGENT_HOSTS } from '../../../../src/lib/contracts/constants/agent-hosts.constant';
import {
	hostsReadingSkills,
	syncPluginSkills,
} from '../../../../src/lib/hosts/plugin-skills.service';
import { activePluginSkills } from '../../../../src/lib/skills/active-plugin-skills';
import type { ISkillCatalog } from '../../../../src/lib/skills/skill-catalog';

const hostsNamed = (...ids: string[]) =>
	AGENT_HOSTS.filter((host) => ids.includes(host.id));

const body = (text: string): string =>
	`---\nname: demo-skill\ndescription: ${text}\n---\n\n# Demo\n`;

describe('syncPluginSkills', () => {
	let root: string;
	const claude = () => join(root, '.claude/skills/demo-skill/SKILL.md');
	const codex = () => join(root, '.agents/skills/demo-skill/SKILL.md');
	const sync = (
		skills = [{ id: 'demo-skill', plugin: 'demo', body: body('one') }],
		hosts = hostsNamed('claude', 'codex'),
	) => syncPluginSkills({ root, hosts, skills });

	beforeEach(() => {
		root = mkdtempSync(join(tmpdir(), 'plugin-skills-'));
	});
	afterEach(() => {
		rmSync(root, { recursive: true, force: true });
	});

	it('installs a skill for every host that reads skills, marked as generated', async () => {
		const changes = await sync();

		expect(changes.map((change) => change.action)).toEqual([
			'created',
			'created',
		]);
		expect(readFileSync(claude(), 'utf8')).toContain(
			'<!-- delendai:plugin-skill plugin=demo sha=',
		);
		expect(readFileSync(codex(), 'utf8')).toContain('# Demo');
	});

	it('writes nothing for a host that reads no skills', async () => {
		const changes = await sync(undefined, hostsNamed('cursor'));

		expect(changes).toEqual([]);
		expect(existsSync(join(root, '.cursor'))).toBe(false);
		expect(hostsReadingSkills(hostsNamed('cursor', 'claude'))).toHaveLength(
			1,
		);
	});

	it('is quiet when nothing changed and rewrites when the source did', async () => {
		await sync();
		expect(await sync()).toEqual([]);

		const changes = await sync([
			{ id: 'demo-skill', plugin: 'demo', body: body('two') },
		]);

		expect(changes.map((change) => change.action)).toEqual([
			'updated',
			'updated',
		]);
		expect(readFileSync(claude(), 'utf8')).toContain('description: two');
	});

	it('removes a skill whose plugin is gone, from every host folder', async () => {
		await sync();

		const changes = await sync([], hostsNamed('claude'));

		expect(changes.map((change) => change.action)).toEqual([
			'removed',
			'removed',
		]);
		expect(existsSync(claude())).toBe(false);
		expect(existsSync(codex())).toBe(false);
	});

	it('never touches a skill without the marker, or one edited by hand', async () => {
		mkdirSync(join(root, '.claude/skills/demo-skill'), { recursive: true });
		writeFileSync(claude(), 'my own skill\n');

		expect((await sync()).map((change) => change.action)).toEqual([
			'kept',
			'created',
		]);
		expect(readFileSync(claude(), 'utf8')).toBe('my own skill\n');
		expect(await sync([], hostsNamed('claude'))).toEqual([
			{
				path: '.agents/skills/demo-skill/SKILL.md',
				plugin: 'demo',
				action: 'removed',
			},
		]);
		expect(readFileSync(claude(), 'utf8')).toBe('my own skill\n');

		await sync();
		writeFileSync(
			codex(),
			readFileSync(codex(), 'utf8').replace('# Demo', '# Mine'),
		);
		const kept = await sync([], hostsNamed('codex'));
		expect(kept.map((change) => change.action)).toContain('kept');
		expect(readFileSync(codex(), 'utf8')).toContain('# Mine');
	});

	it('leaves the files alone on a dry run', async () => {
		const changes = await syncPluginSkills({
			root,
			hosts: hostsNamed('claude'),
			skills: [{ id: 'demo-skill', plugin: 'demo', body: body('one') }],
			apply: false,
		});

		expect(changes).toHaveLength(1);
		expect(existsSync(claude())).toBe(false);
	});

	it('refuses a skill id that is not a plain folder name', async () => {
		const changes = await syncPluginSkills({
			root,
			hosts: hostsNamed('claude'),
			skills: [{ id: '../escape', plugin: 'demo', body: body('x') }],
		});

		expect(changes).toEqual([]);
	});
});

describe('activePluginSkills', () => {
	const entry = (id: string, appliesTo: string[], plugin?: string) => ({
		id,
		version: '1.0.0',
		minCoreVersion: '0.0.0',
		description: id,
		appliesTo,
		tags: [],
		bodyPath: `${id}/SKILL.md`,
		...(plugin === undefined ? {} : { plugin }),
	});
	const catalog: ISkillCatalog = {
		entries: [
			entry('a', ['@delendai/proposals']),
			entry('b', ['@delendai/*']),
			entry('c', ['@delendai/core']),
			entry('d', ['@delendai/audit'], 'quality'),
			entry('e', ['@delendai/logs', '@delendai/proposals']),
		],
		loadBody: async (id) => `body of ${id}`,
	};

	it('keeps the skills of active plugins, and never the core ones', async () => {
		const skills = await activePluginSkills(catalog, [
			'proposals',
			'quality',
		]);

		expect(skills.map((skill) => [skill.id, skill.plugin])).toEqual([
			['a', 'proposals'],
			['d', 'quality'],
			['e', 'proposals'],
		]);
		expect(skills[0]?.body).toBe('body of a');
	});
});
