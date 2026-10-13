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

import { reportPluginAgents } from '../../../../src/lib/scaffold/plugin-agents-report';
import { syncPluginAgents } from '../../../../src/lib/scaffold/plugin-agents.service';

const role = {
	role: 'migration-runner',
	description: 'Runs the schema migrations',
	instructions: 'Run `acme_migrate` and report.',
};

describe('syncPluginAgents', () => {
	let root: string;
	const sync = (contributions = [{ plugin: 'db', role }]) =>
		syncPluginAgents({ root, namespacePrefix: 'acme', contributions });
	const copilot = () =>
		join(root, '.github/agents/acme-migration-runner.agent.md');
	beforeEach(() => {
		root = mkdtempSync(join(tmpdir(), 'plugin-agents-'));
		mkdirSync(join(root, '.vscode'));
		writeFileSync(
			join(root, '.vscode/mcp.json'),
			JSON.stringify({
				servers: {
					'Acme Tools': { command: 'npx', args: ['@delendai/core'] },
				},
			}),
		);
	});
	afterEach(() => rmSync(root, { recursive: true, force: true }));

	it('writes each contributed role for Copilot and Claude Code, once', async () => {
		expect(
			(await sync()).map((change) => [change.path, change.action]),
		).toEqual([
			['.github/agents/acme-migration-runner.agent.md', 'created'],
			['.claude/agents/acme-migration-runner.md', 'created'],
		]);
		expect(readFileSync(copilot(), 'utf8')).toContain('acme-tools/*]');
		expect(await sync()).toEqual([]);
	});

	it('rewrites a changed declaration, and removes the agents of a plugin that left', async () => {
		await sync();
		const changed = await sync([
			{ plugin: 'db', role: { ...role, instructions: 'New.' } },
		]);
		expect(changed.every((change) => change.action === 'updated')).toBe(
			true,
		);
		const removed = await sync([]);
		expect(removed.map((change) => change.action)).toEqual([
			'removed',
			'removed',
		]);
		expect(existsSync(copilot())).toBe(false);
	});

	it('never rewrites or removes a file a person edited', async () => {
		await sync();
		writeFileSync(
			copilot(),
			`${readFileSync(copilot(), 'utf8').replace('report', 'tell me')}`,
		);
		expect(
			(await sync([])).find((change) => change.path.startsWith('.github'))
				?.action,
		).toBe('kept');
		expect(existsSync(copilot())).toBe(true);
	});

	it('ignores a role id that is not kebab case', async () => {
		expect(
			await sync([
				{ plugin: 'db', role: { ...role, role: '../escape' } },
			]),
		).toEqual([]);
	});

	it('is reported at start from the loaded plugins', async () => {
		const lines: string[] = [];
		const loaded = [
			{ plugin: { name: 'db' }, registrations: { agentRoles: [role] } },
		];
		await reportPluginAgents(root, 'acme', loaded, (line) =>
			lines.push(line),
		);
		expect(lines).toEqual([
			'[delendai] agent .github/agents/acme-migration-runner.agent.md (plugin db) created.\n',
			'[delendai] agent .claude/agents/acme-migration-runner.md (plugin db) created.\n',
		]);
	});
});
