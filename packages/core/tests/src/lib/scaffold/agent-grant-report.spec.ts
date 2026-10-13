import {
	chmodSync,
	mkdirSync,
	mkdtempSync,
	rmSync,
	writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { reportAgentGrants } from '../../../../src/lib/scaffold/agent-grant-report';

describe('reportAgentGrants', () => {
	const roots: string[] = [];
	afterEach(() => {
		for (const root of roots.splice(0))
			rmSync(root, { recursive: true, force: true });
	});

	const project = (): string => {
		const root = mkdtempSync(join(tmpdir(), 'agent-report-'));
		roots.push(root);
		mkdirSync(join(root, '.vscode'));
		mkdirSync(join(root, '.github/agents'), { recursive: true });
		writeFileSync(
			join(root, '.vscode/mcp.json'),
			JSON.stringify({
				servers: {
					DelendAI: { command: 'npx', args: ['@delendai/core'] },
				},
			}),
		);
		writeFileSync(
			join(root, '.github/agents/delendai.agent.md'),
			'---\nname: delendai\ntools: [read, old/*]\n---\n',
		);
		return root;
	};

	it('says which agent now grants which server', async () => {
		const root = project();
		const lines: string[] = [];
		await reportAgentGrants(root, 'delendai', (line) => lines.push(line));
		expect(lines).toEqual([
			'[delendai] .github/agents/delendai.agent.md now grants delendai/* instead of old/*, the server this project registers.\n',
		]);
	});

	it('reports a failure instead of failing the start', async () => {
		const root = project();
		chmodSync(join(root, '.github/agents'), 0o555);
		const lines: string[] = [];
		try {
			await reportAgentGrants(root, 'delendai', (line) =>
				lines.push(line),
			);
		} finally {
			chmodSync(join(root, '.github/agents'), 0o755);
		}
		expect(lines).toHaveLength(1);
		expect(lines[0]).toContain(
			"could not bring the agents' server grants in line",
		);
	});
});
