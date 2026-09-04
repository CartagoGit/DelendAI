import {
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	utimesSync,
	writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';

import {
	loadSkill,
	loadSkillCached,
} from '@delendai/core/lib/skills/registry';

const repoRoot = resolve(
	dirname(fileURLToPath(import.meta.url)),
	'../../../../../..',
);

const createdDirs: string[] = [];

const makeWorkspace = (): string => {
	const dir = mkdtempSync(join(tmpdir(), 'skill-registry-'));
	createdDirs.push(dir);
	return dir;
};

const writeSkill = (
	workspaceRoot: string,
	relPath: string,
	body: string,
): string => {
	const absPath = join(workspaceRoot, ...relPath.split('/'));
	mkdirSync(dirname(absPath), { recursive: true });
	writeFileSync(absPath, body);
	return absPath;
};

afterEach(() => {
	for (const dir of createdDirs.splice(0)) {
		rmSync(dir, { recursive: true, force: true });
	}
});

describe('loadSkill', () => {
	it('loads a skill from a plugin root before other roots', async () => {
		const workspaceRoot = makeWorkspace();
		writeSkill(
			workspaceRoot,
			'plugins/proposals/skills/proposals-workflow-playbook/SKILL.md',
			'plugin skill body',
		);

		const loaded = await loadSkill('proposals-workflow-playbook', {
			workspaceRoot,
		});

		expect(loaded).toMatchObject({
			id: 'proposals-workflow-playbook',
			body: 'plugin skill body',
			source: 'plugin',
		});
	});

	it('loads a skill from the core root', async () => {
		const workspaceRoot = makeWorkspace();
		writeSkill(
			workspaceRoot,
			'packages/core/skills/operator/SKILL.md',
			'core skill body',
		);

		const loaded = await loadSkill('operator', { workspaceRoot });

		expect(loaded).toMatchObject({
			id: 'operator',
			body: 'core skill body',
			source: 'core',
		});
	});

	it('returns null for an unknown skill', async () => {
		const workspaceRoot = makeWorkspace();

		await expect(
			loadSkill('missing-skill', { workspaceRoot }),
		).resolves.toBeNull();
	});

	it('uses lexicographic plugin order when two plugins ship the same id', async () => {
		const workspaceRoot = makeWorkspace();
		const alphaPath = writeSkill(
			workspaceRoot,
			'plugins/alpha/skills/shared-skill/SKILL.md',
			'alpha body',
		);
		writeSkill(
			workspaceRoot,
			'plugins/beta/skills/shared-skill/SKILL.md',
			'beta body',
		);

		const loaded = await loadSkill('shared-skill', { workspaceRoot });

		expect(loaded).toMatchObject({
			body: 'alpha body',
			source: 'plugin',
			sourcePath: alphaPath,
		});
	});

	it('falls back to the web root after plugin and core misses', async () => {
		const workspaceRoot = makeWorkspace();
		writeSkill(
			workspaceRoot,
			'apps/web/skills/web-only/SKILL.md',
			'web skill body',
		);

		const loaded = await loadSkill('web-only', { workspaceRoot });

		expect(loaded).toMatchObject({
			body: 'web skill body',
			source: 'web',
		});
	});

	it('resolves the three F204 skill ids from the real workspace', async () => {
		const ids = [
			'proposals-workflow-playbook',
			'operator',
			'status-marker-and-closure',
		] as const;

		const loaded = await Promise.all(
			ids.map((id) => loadSkill(id, { workspaceRoot: repoRoot })),
		);

		expect(loaded[0]?.body).toContain('# proposals workflow playbook');
		expect(loaded[1]?.body).toContain('# mcp-vertex operator');
		expect(loaded[2]?.body).toContain(
			'# mcp-vertex status marker + closure',
		);
	});
});

describe('loadSkillCached', () => {
	it('returns a fresh cache entry within 1 hour', async () => {
		const workspaceRoot = makeWorkspace();
		const cachePath = writeSkill(
			workspaceRoot,
			'.cache/mcp-vertex/skills/operator.json',
			JSON.stringify({
				id: 'operator',
				body: 'cached body',
				source: 'core',
				sourcePath: '/tmp/operator',
				cachedAt: '2026-07-25T11:55:00.000Z',
			}),
		);
		const fixedNow = new Date('2026-07-25T12:00:00.000Z');
		utimesSync(
			cachePath,
			fixedNow,
			new Date(fixedNow.getTime() - 5 * 60 * 1000),
		);
		let reads = 0;

		const loaded = await loadSkillCached('operator', {
			workspaceRoot,
			now: () => fixedNow.getTime(),
			fsRead: async (absPath) => {
				reads += 1;
				return readFileSync(absPath, 'utf8');
			},
		});

		expect(loaded).toMatchObject({
			body: 'cached body',
			source: 'core',
			cachedAt: '2026-07-25T11:55:00.000Z',
		});
		expect(reads).toBe(1);
	});

	it('refreshes a stale cache entry after 1 hour', async () => {
		const workspaceRoot = makeWorkspace();
		const cachePath = writeSkill(
			workspaceRoot,
			'.cache/mcp-vertex/skills/operator.json',
			JSON.stringify({
				id: 'operator',
				body: 'stale body',
				source: 'core',
				sourcePath: '/tmp/operator',
				cachedAt: '2026-07-25T09:00:00.000Z',
			}),
		);
		writeSkill(
			workspaceRoot,
			'packages/core/skills/operator/SKILL.md',
			'fresh core body',
		);
		const fixedNow = new Date('2026-07-25T12:00:00.000Z');
		utimesSync(
			cachePath,
			fixedNow,
			new Date(fixedNow.getTime() - 2 * 60 * 60 * 1000),
		);

		const loaded = await loadSkillCached('operator', {
			workspaceRoot,
			now: () => fixedNow.getTime(),
		});

		expect(loaded).toMatchObject({
			body: 'fresh core body',
			source: 'core',
			cachedAt: '2026-07-25T12:00:00.000Z',
		});
		expect(
			JSON.parse(readFileSync(cachePath, 'utf8')) as { body: string },
		).toMatchObject({ body: 'fresh core body' });
	});

	it('falls through to disk when the cache file is malformed', async () => {
		const workspaceRoot = makeWorkspace();
		const cachePath = writeSkill(
			workspaceRoot,
			'.cache/mcp-vertex/skills/operator.json',
			'{bad json',
		);
		writeSkill(
			workspaceRoot,
			'packages/core/skills/operator/SKILL.md',
			'recovered core body',
		);
		const fixedNow = new Date('2026-07-25T12:00:00.000Z');
		utimesSync(
			cachePath,
			fixedNow,
			new Date(fixedNow.getTime() - 10 * 60 * 1000),
		);

		const loaded = await loadSkillCached('operator', {
			workspaceRoot,
			now: () => fixedNow.getTime(),
		});

		expect(loaded).toMatchObject({
			body: 'recovered core body',
			source: 'core',
		});
		expect(
			JSON.parse(readFileSync(cachePath, 'utf8')) as { body: string },
		).toMatchObject({ body: 'recovered core body' });
	});
});
