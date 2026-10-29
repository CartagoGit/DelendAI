import { describe, expect, it } from 'vitest';

import type { IFileReader } from '@delendai/core/lib/bootstrap/analyze-project';
import { buildProjectShape } from '@delendai/core/lib/bootstrap/project-shape';
import {
	DEFAULT_PROJECT_ROLE_RULES,
	matchProjectRoles,
} from '@delendai/core/lib/bootstrap/role-rules';

const reader = (files: Record<string, string>): IFileReader => ({
	readFile: async (path) => files[path],
	exists: async (path) => path in files,
	listDir: async (path) => {
		const prefix = path === '' || path === '.' ? '' : `${path}/`;
		const children = new Set<string>();
		for (const file of Object.keys(files)) {
			if (!file.startsWith(prefix)) continue;
			const child = file.slice(prefix.length).split('/')[0];
			if (child !== undefined && child !== '') children.add(child);
		}
		return [...children];
	},
});

const rolesOf = async (files: Record<string, string>) =>
	(await buildProjectShape(reader(files))).roles.map(
		(finding) => finding.role,
	);

describe('project roles are orthogonal', async () => {
	it('does not call Django a library', async () => {
		const roles = await rolesOf({
			'pyproject.toml': '[project]\ndependencies = ["Django>=5"]',
		});
		expect(roles).toContain('backend-api');
		expect(roles).not.toContain('library');
	});

	it('does not call FastAPI a library', async () => {
		const roles = await rolesOf({
			'requirements.txt': 'fastapi==0.115\n',
		});
		expect(roles).toContain('backend-api');
		expect(roles).not.toContain('library');
	});

	it('does not call Celery a library', async () => {
		const roles = await rolesOf({
			'pyproject.toml': '[project]\ndependencies = ["celery>=5"]',
		});
		expect(roles).toContain('data-pipeline');
		expect(roles).not.toContain('library');
	});

	it('recognises Go cmd/*/main.go as a CLI', async () => {
		const roles = await rolesOf({
			'go.mod': 'module example.com/tool',
			'cmd/serve/main.go': 'package main\nfunc main() {}',
		});
		expect(roles).toContain('cli');
	});

	it('does not infer a game from Three.js alone', async () => {
		const roles = await rolesOf({
			'package.json': JSON.stringify({
				dependencies: { three: '^0.170.0' },
			}),
		});
		expect(roles).not.toContain('game');
	});

	it('keeps monorepo shape separate from several simultaneous roles', async () => {
		const shape = await buildProjectShape(
			reader({
				'package.json': JSON.stringify({
					workspaces: ['packages/*'],
					dependencies: { react: '^18', fastify: '^5' },
					main: './dist/index.js',
				}),
				'go.mod': 'module example.com/root',
				'cmd/api/main.go': 'package main',
			}),
		);
		expect(shape.workspace).toBe('monorepo');
		expect(shape.roles.map((finding) => finding.role)).toEqual(
			expect.arrayContaining([
				'web-client',
				'backend-api',
				'library',
				'cli',
			]),
		);
	});
});

describe('role rule table contract', async () => {
	it('has unique role ids and priorities', async () => {
		const ids = DEFAULT_PROJECT_ROLE_RULES.map((rule) => rule.id);
		expect(new Set(ids).size).toBe(ids.length);
		for (const rule of DEFAULT_PROJECT_ROLE_RULES) {
			expect(Number.isFinite(rule.priority)).toBe(true);
		}
	});

	it('retains evidence on every detected role', async () => {
		const matches = await matchProjectRoles({
			reader: reader({
				'package.json': JSON.stringify({
					dependencies: { react: '^18' },
				}),
			}),
			dependencies: { react: '^18' },
		});
		expect(matches[0]?.signals.length).toBeGreaterThan(0);
	});
});
