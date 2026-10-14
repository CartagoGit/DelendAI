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

import { afterEach, describe, expect, it } from 'vitest';

import {
	firstRunSetup,
	reportFirstRunSetup,
} from '../../../../src/lib/adopt/first-run-setup.service';

describe('firstRunSetup', () => {
	const roots: string[] = [];
	const project = (withGit = true): string => {
		const root = mkdtempSync(join(tmpdir(), 'first-run-'));
		roots.push(root);
		if (withGit) mkdirSync(join(root, '.git'));
		mkdirSync(join(root, '.vscode'));
		writeFileSync(
			join(root, '.vscode/mcp.json'),
			JSON.stringify({
				servers: {
					Acme: { command: 'npx', args: ['-y', '@delendai/core'] },
				},
			}),
		);
		writeFileSync(
			join(root, 'package.json'),
			JSON.stringify({ name: 'acme' }),
		);
		return root;
	};
	afterEach(() => {
		for (const root of roots.splice(0))
			rmSync(root, { recursive: true, force: true });
	});

	it('sets a project with no delendai up once, with the defaults', async () => {
		const root = project();
		const created = await firstRunSetup(root);
		expect(created).toContain('delendai.config.json');
		expect(
			created?.some((path) => path.startsWith('.github/agents/')),
		).toBe(true);
		expect(existsSync(join(root, 'delendai.config.json'))).toBe(true);
		expect(created).toContain('docs/delendai/README.md');
		expect(await firstRunSetup(root)).toBeUndefined();
	});

	it('writes nothing outside a project', async () => {
		const root = project(false);
		expect(await firstRunSetup(root)).toBeUndefined();
		expect(existsSync(join(root, 'delendai.config.json'))).toBe(false);
	});

	it('writes nothing in a project that does not register delendai itself', async () => {
		const root = project();
		writeFileSync(
			join(root, '.vscode/mcp.json'),
			JSON.stringify({ servers: {} }),
		);
		expect(await firstRunSetup(root)).toBeUndefined();
		expect(existsSync(join(root, 'delendai.config.json'))).toBe(false);
	});

	it('grants the agents the server name the project registered', async () => {
		const root = project();
		await firstRunSetup(root);
		const agent = readFileSync(
			join(root, '.github/agents/orchestrator.agent.md'),
			'utf8',
		);
		expect(agent).toContain('acme/*');
	});

	it('says what it created, once', async () => {
		const root = project();
		const lines: string[] = [];
		await reportFirstRunSetup(root, undefined, (line) => lines.push(line));
		await reportFirstRunSetup(root, undefined, (line) => lines.push(line));
		expect(lines).toHaveLength(1);
		expect(lines[0]).toContain('first start in this project');
	});
});
