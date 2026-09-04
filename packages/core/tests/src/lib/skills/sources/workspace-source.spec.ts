import { describe, expect, it } from 'vitest';

import { workspaceSkillSource } from '@delendai/core/lib/skills/sources/workspace-source';

const FILES: Readonly<Record<string, string>> = {
	'/ws/.mcp-vertex/skills/operator/SKILL.md': '# operator\nbody of operator',
	'/ws/.mcp-vertex/skills/token-budget/SKILL.md': '# token-budget\nbe lean',
};

const listDir = async (abs: string): Promise<readonly string[]> => {
	if (abs === '/ws/.mcp-vertex/skills') {
		return ['operator', 'token-budget'];
	}
	return [];
};
const readFile = async (abs: string): Promise<string> => {
	const content = FILES[abs];
	if (content === undefined) throw new Error(`ENOENT ${abs}`);
	return content;
};

describe('skills/sources/workspace-source (q00009 / f00262)', () => {
	it('lists all skills under <workspaceRoot>/.mcp-vertex/skills/<id>/', async () => {
		const src = workspaceSkillSource({
			id: 'ws',
			workspaceRoot: '/ws',
			listDir,
			readFile,
		});
		const list = await src.list();
		expect(list.map((s) => s.id).sort()).toEqual([
			'operator',
			'token-budget',
		]);
		for (const desc of list) {
			expect(desc.source).toBe('workspace');
			expect(desc.owner).toBe('ws');
		}
	});

	it('load() returns the body for an existing skill', async () => {
		const src = workspaceSkillSource({
			id: 'ws',
			workspaceRoot: '/ws',
			listDir,
			readFile,
		});
		const loaded = await src.load('operator');
		expect(loaded?.body).toContain('body of operator');
		expect(loaded?.source).toBe('workspace');
	});

	it('load() returns null for a missing skill', async () => {
		const src = workspaceSkillSource({
			id: 'ws',
			workspaceRoot: '/ws',
			listDir,
			readFile,
		});
		expect(await src.load('missing')).toBeNull();
	});

	it('skips a folder that has no SKILL.md', async () => {
		const src = workspaceSkillSource({
			id: 'ws',
			workspaceRoot: '/ws',
			listDir,
			readFile: async (abs: string): Promise<string> => {
				if (abs.includes('operator')) return 'op body';
				throw new Error(`ENOENT ${abs}`);
			},
		});
		const list = await src.list();
		expect(list.find((d) => d.id === 'token-budget')).toBeUndefined();
	});

	it('returns empty list when the workspace folder is missing', async () => {
		const src = workspaceSkillSource({
			id: 'ws',
			workspaceRoot: '/ws',
			listDir: async () => {
				throw new Error('ENOENT');
			},
			readFile,
		});
		const list = await src.list();
		expect(list).toEqual([]);
	});

	it('returns empty list when disabled', async () => {
		const src = workspaceSkillSource({
			id: 'ws',
			workspaceRoot: '/ws',
			listDir,
			readFile,
			enabled: false,
		});
		expect(await src.list()).toEqual([]);
		expect(await src.load('operator')).toBeNull();
	});
});
