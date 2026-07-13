import { mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
	detectSelfHostDogfoodDrift,
	formatSelfHostDogfoodReport,
} from './self-host-dogfood.script';

const canonicalEntry = (workspace: string) => ({
	type: 'stdio',
	command: 'bunx',
	args: [
		'--package',
		'@mcp-vertex/cli',
		'mcpv',
		'__serve',
		'--workspace',
		workspace,
	],
});

const makeRoot = async (
	generic = canonicalEntry('.'),
	vscode = canonicalEntry('${workspaceFolder}'),
): Promise<string> => {
	const root = join(
		tmpdir(),
		`self-host-dogfood-${Date.now()}-${Math.random().toString(36).slice(2)}`,
	);
	await mkdir(join(root, '.vscode'), { recursive: true });
	await writeFile(
		join(root, '.mcp.json'),
		JSON.stringify({ mcpServers: { 'mcp-vertex': generic } }),
	);
	await writeFile(
		join(root, '.vscode/mcp.json'),
		JSON.stringify({
			servers: {
				'mcp-vertex': vscode,
				filesystem: { command: 'unrelated', args: [] },
			},
		}),
	);
	return root;
};

describe('self-host-dogfood', () => {
	it('accepts both init-equivalent host shapes and ignores sibling servers', async () => {
		const root = await makeRoot();
		try {
			expect(await detectSelfHostDogfoodDrift(root)).toEqual([]);
		} finally {
			await rm(root, { recursive: true, force: true });
		}
	});

	it('reports command and argv drift independently', async () => {
		const root = await makeRoot(
			{ ...canonicalEntry('.'), command: 'bun' },
			{
				...canonicalEntry('${workspaceFolder}'),
				args: ['local-script.ts'],
			},
		);
		try {
			const findings = await detectSelfHostDogfoodDrift(root);
			expect(findings).toHaveLength(2);
			expect(formatSelfHostDogfoodReport(findings)).toContain(
				'command drift',
			);
			expect(formatSelfHostDogfoodReport(findings)).toContain(
				'args drift',
			);
		} finally {
			await rm(root, { recursive: true, force: true });
		}
	});

	it('reports missing or invalid client files without throwing', async () => {
		const root = await makeRoot();
		await writeFile(join(root, '.mcp.json'), '{');
		await rm(join(root, '.vscode/mcp.json'));
		try {
			const findings = await detectSelfHostDogfoodDrift(root);
			expect(findings).toHaveLength(2);
			expect(
				findings.every((finding) =>
					finding.detail.includes('valid JSON'),
				),
			).toBe(true);
		} finally {
			await rm(root, { recursive: true, force: true });
		}
	});
});
