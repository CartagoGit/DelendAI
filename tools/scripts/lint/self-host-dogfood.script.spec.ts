import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { buildCanonicalLaunch } from '../../../packages/cli/src/lib/server-args.service';
import {
	detectSelfHostDogfoodDrift,
	formatSelfHostDogfoodReport,
	findDelendaiServerKey,
} from './self-host-dogfood.script';

const canonicalEntry = (workspace: string) => ({
	type: 'stdio',
	...buildCanonicalLaunch({ workspace }),
});

const localDogfoodEntry = (workspace: string) => ({
	type: 'stdio',
	command: 'bun',
	args: [
		'--watch',
		'tools/scripts/host/host-server.script.ts',
		`--workspace=${workspace}`,
	],
});

const makeRoot = async (
	generic = canonicalEntry('.'),
	vscode = canonicalEntry('${workspaceFolder}'),
): Promise<string> => {
	const root = await mkdtemp(join(tmpdir(), 'self-host-dogfood-'));
	await mkdir(join(root, '.vscode'), { recursive: true });
	await writeFile(
		join(root, '.mcp.json'),
		JSON.stringify({ mcpServers: { delendai: generic } }),
	);
	await writeFile(
		join(root, '.vscode/mcp.json'),
		JSON.stringify({
			servers: {
				delendai: vscode,
				filesystem: { command: 'unrelated', args: [] },
			},
		}),
	);
	return root;
};

describe('self-host-dogfood', () => {
	it('[<200ms] accepts the published bunx launch and ignores sibling servers', async () => {
		const root = await makeRoot();
		try {
			expect(await detectSelfHostDogfoodDrift(root)).toEqual([]);
		} finally {
			await rm(root, { recursive: true, force: true });
		}
	});

	it('[<200ms] accepts the repo-local host-source dogfood launch', async () => {
		const root = await makeRoot(
			localDogfoodEntry('.'),
			localDogfoodEntry('${workspaceFolder}'),
		);
		try {
			expect(await detectSelfHostDogfoodDrift(root)).toEqual([]);
		} finally {
			await rm(root, { recursive: true, force: true });
		}
	});

	it('[<200ms] reports launch drift when neither canonical shape matches', async () => {
		const root = await makeRoot(
			{ ...canonicalEntry('.'), command: 'node' },
			{
				...canonicalEntry('${workspaceFolder}'),
				args: ['some-other-script.ts'],
			},
		);
		try {
			const findings = await detectSelfHostDogfoodDrift(root);
			expect(findings).toHaveLength(2);
			const report = formatSelfHostDogfoodReport(findings);
			expect(report).toContain('launch drift');
			expect(report).toContain('OR');
		} finally {
			await rm(root, { recursive: true, force: true });
		}
	});

	it('[<200ms] reports missing or invalid client files without throwing', async () => {
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

describe('self-host-dogfood — the server key is branded (user directive, 2026-09-09)', () => {
	it('[<200ms] accepts `DelendAI` and the adopter `DelendAI:<project>` shape', () => {
		expect(findDelendaiServerKey({ DelendAI: {} })).toBe('DelendAI');
		expect(findDelendaiServerKey({ 'DelendAI:my-app': {} })).toBe(
			'DelendAI:my-app',
		);
		// The historical lowercase spelling still resolves, so an adopter
		// who ran an older `delendai init` is not suddenly in violation.
		expect(findDelendaiServerKey({ delendai: {} })).toBe('delendai');
	});

	it('[<200ms] does not match an unrelated server', () => {
		expect(
			findDelendaiServerKey({ filesystem: {}, github: {} }),
		).toBeUndefined();
		// `delendai-something` is a different server, not a scoped instance:
		// the scoping separator is a colon.
		expect(findDelendaiServerKey({ 'delendai-old': {} })).toBeUndefined();
	});

	it('[<200ms] tolerates a missing collection', () => {
		expect(findDelendaiServerKey(undefined)).toBeUndefined();
	});
});
