import { mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { afterEach, describe, expect, it } from 'vitest';

import {
	readConfigurationDocument,
	saveConfigurationDocument,
} from '../../src/public';

const roots: string[] = [];
const workspace = async (): Promise<string> => {
	const root = await mkdtemp(join(tmpdir(), 'delendai-config-center-'));
	roots.push(root);
	return root;
};

afterEach(async () => {
	await Promise.all(
		roots.splice(0).map((root) => rm(root, { recursive: true })),
	);
});

describe('configuration center document service', () => {
	it('reads an absent document as an empty, digest-addressable snapshot', async () => {
		const root = await workspace();
		const first = await readConfigurationDocument({ workspaceRoot: root });
		const second = await readConfigurationDocument({ workspaceRoot: root });

		expect(first.exists).toBe(false);
		expect(first.value).toEqual({});
		expect(first.digest).toBe(second.digest);
	});

	it('redacts secret material without exposing it in the display snapshot', async () => {
		const root = await workspace();
		await writeFile(
			join(root, 'delendai.config.json'),
			JSON.stringify({
				custom: { token: 'github_pat_abcdefghijklmnopqrstuv' },
			}),
		);

		const snapshot = await readConfigurationDocument({
			workspaceRoot: root,
		});

		expect(snapshot.redactions).toBe(1);
		expect(snapshot.value).toEqual({ custom: { token: '[REDACTED]' } });
	});

	it('merges path edits while preserving unknown and plugin-owned fields', async () => {
		const root = await workspace();
		const file = join(root, 'delendai.config.json');
		await writeFile(
			file,
			JSON.stringify({
				futureRoot: { retained: true },
				plugins: {
					local: {
						path: './plugins/local.ts',
						prefix: 'local-prefix',
						options: { custom: 1 },
					},
				},
			}),
		);
		const before = await readConfigurationDocument({ workspaceRoot: root });

		const result = await saveConfigurationDocument({
			workspaceRoot: root,
			expectedDigest: before.digest,
			edits: [
				{ action: 'set', path: ['keepLegacy'], value: true },
				{
					action: 'set',
					path: ['plugins', 'local', 'enabled'],
					value: false,
				},
			],
		});

		expect(result.ok && result.changed).toBe(true);
		expect(JSON.parse(await readFile(file, 'utf8'))).toEqual({
			futureRoot: { retained: true },
			plugins: {
				local: {
					path: './plugins/local.ts',
					prefix: 'local-prefix',
					options: { custom: 1 },
					enabled: false,
				},
			},
			keepLegacy: true,
		});
	});

	it('round-trips disabled external MCP definitions and custom arguments losslessly', async () => {
		const root = await workspace();
		const file = join(root, 'delendai.config.json');
		const externalServer = {
			enabled: false,
			version: '1.2.3',
			command: 'npx',
			args: [
				'-y',
				'@example/mcp@1.2.3',
				'--workspace',
				'${workspaceFolder}',
			],
			namespacePrefix: 'ext.example',
			detect: '@example/client',
			env: ['EXAMPLE_TOKEN'],
		};
		await writeFile(
			file,
			JSON.stringify({
				futureRoot: { retained: true },
				plugins: {
					'external-mcps': {
						options: { servers: { example: externalServer } },
					},
					search: {
						options: { roots: ['packages'], futureOption: 7 },
					},
				},
			}),
		);
		const before = await readConfigurationDocument({ workspaceRoot: root });

		const result = await saveConfigurationDocument({
			workspaceRoot: root,
			expectedDigest: before.digest,
			edits: [
				{
					action: 'set',
					path: ['plugins', 'search', 'options', 'maxResults'],
					value: 25,
				},
			],
		});

		expect(result).toMatchObject({ ok: true, changed: true });
		const persisted = JSON.parse(await readFile(file, 'utf8'));
		expect(persisted.futureRoot).toEqual({ retained: true });
		expect(
			persisted.plugins['external-mcps'].options.servers.example,
		).toEqual(externalServer);
		expect(persisted.plugins.search.options).toEqual({
			roots: ['packages'],
			futureOption: 7,
			maxResults: 25,
		});
	});

	it('returns a conflict and the fresh document after an external edit', async () => {
		const root = await workspace();
		const file = join(root, 'delendai.config.json');
		await writeFile(file, '{"keepLegacy":false}\n');
		const stale = await readConfigurationDocument({ workspaceRoot: root });
		await writeFile(file, '{"keepLegacy":true}\n');

		const result = await saveConfigurationDocument({
			workspaceRoot: root,
			expectedDigest: stale.digest,
			edits: [{ action: 'set', path: ['agentWorktree'], value: true }],
		});

		expect(result.ok).toBe(false);
		if (result.ok || result.reason !== 'conflict')
			throw new Error('expected conflict');
		expect(result.document.value).toEqual({ keepLegacy: true });
		expect(await readFile(file, 'utf8')).toBe('{"keepLegacy":true}\n');
	});

	it('serializes competing saves so one wins and one observes a conflict', async () => {
		const root = await workspace();
		const snapshot = await readConfigurationDocument({
			workspaceRoot: root,
		});

		const results = await Promise.all([
			saveConfigurationDocument({
				workspaceRoot: root,
				expectedDigest: snapshot.digest,
				edits: [{ action: 'set', path: ['keepLegacy'], value: true }],
			}),
			saveConfigurationDocument({
				workspaceRoot: root,
				expectedDigest: snapshot.digest,
				edits: [
					{ action: 'set', path: ['agentWorktree'], value: true },
				],
			}),
		]);

		expect(results.filter((result) => result.ok)).toHaveLength(1);
		expect(
			results.filter(
				(result) => !result.ok && result.reason === 'conflict',
			),
		).toHaveLength(1);
	});

	it('rejects schema-invalid edits and preserves the original bytes', async () => {
		const root = await workspace();
		const file = join(root, 'delendai.config.json');
		const original = '{"keepLegacy":false}\n';
		await writeFile(file, original);
		const snapshot = await readConfigurationDocument({
			workspaceRoot: root,
		});

		const result = await saveConfigurationDocument({
			workspaceRoot: root,
			expectedDigest: snapshot.digest,
			edits: [{ action: 'set', path: ['keepLegacy'], value: 'yes' }],
		});

		expect(result.ok).toBe(false);
		if (result.ok) throw new Error('expected validation failure');
		expect(result.reason).toBe('validation');
		expect(await readFile(file, 'utf8')).toBe(original);
	});

	it('rejects secret-valued edits and leaves hidden values untouched', async () => {
		const root = await workspace();
		const file = join(root, 'delendai.config.json');
		const original = JSON.stringify({ custom: { retained: true } });
		await writeFile(file, original);
		const snapshot = await readConfigurationDocument({
			workspaceRoot: root,
		});

		const result = await saveConfigurationDocument({
			workspaceRoot: root,
			expectedDigest: snapshot.digest,
			edits: [
				{
					action: 'set',
					path: ['plugins', 'remote', 'options', 'apiKey'],
					value: 'sk-abcdefghijklmnopqrstuvwxyz',
				},
			],
		});

		expect(result.ok).toBe(false);
		if (result.ok) throw new Error('expected secret rejection');
		expect(result.reason).toBe('secret');
		expect(await readFile(file, 'utf8')).toBe(original);
	});

	it('allows deleting a secret field without ever returning its value', async () => {
		const root = await workspace();
		const file = join(root, 'delendai.config.json');
		await writeFile(
			file,
			JSON.stringify({
				custom: { token: 'github_pat_abcdefghijklmnopqrstuv' },
			}),
		);
		const snapshot = await readConfigurationDocument({
			workspaceRoot: root,
		});

		const result = await saveConfigurationDocument({
			workspaceRoot: root,
			expectedDigest: snapshot.digest,
			edits: [{ action: 'delete', path: ['custom', 'token'] }],
		});

		expect(result.ok).toBe(true);
		expect(JSON.parse(await readFile(file, 'utf8'))).toEqual({
			custom: {},
		});
	});

	it('treats deletion of a missing nested field as an idempotent no-op', async () => {
		const root = await workspace();
		const snapshot = await readConfigurationDocument({
			workspaceRoot: root,
		});

		const result = await saveConfigurationDocument({
			workspaceRoot: root,
			expectedDigest: snapshot.digest,
			edits: [
				{ action: 'delete', path: ['plugins', 'missing', 'enabled'] },
			],
		});

		expect(result).toMatchObject({ ok: true, changed: false });
		expect(
			(await readConfigurationDocument({ workspaceRoot: root })).exists,
		).toBe(false);
	});

	it('returns validation issues for non-JSON edit values instead of throwing', async () => {
		const root = await workspace();
		const snapshot = await readConfigurationDocument({
			workspaceRoot: root,
		});

		const result = await saveConfigurationDocument({
			workspaceRoot: root,
			expectedDigest: snapshot.digest,
			edits: [{ action: 'set', path: ['custom'], value: undefined }],
		});

		expect(result.ok).toBe(false);
		if (result.ok) throw new Error('expected validation failure');
		expect(result.reason).toBe('validation');
	});

	it('fails closed on corrupt JSON and rejects escaping config names', async () => {
		const root = await workspace();
		const file = join(root, 'delendai.config.json');
		const original = '{"plugins":';
		await writeFile(file, original);

		await expect(
			readConfigurationDocument({ workspaceRoot: root }),
		).rejects.toThrow('Invalid JSON');
		expect(await readFile(file, 'utf8')).toBe(original);
		await expect(
			readConfigurationDocument({
				workspaceRoot: root,
				configFileName: '../outside.json',
			}),
		).rejects.toThrow('plain file name');
	});

	it('refuses to read a configuration symlink outside the workspace', async () => {
		const root = await workspace();
		const outside = join(await workspace(), 'outside.json');
		await writeFile(outside, '{"keepLegacy":true}\n');
		await symlink(outside, join(root, 'delendai.config.json'));

		await expect(
			readConfigurationDocument({ workspaceRoot: root }),
		).rejects.toThrow('must not be a symbolic link');
	});
});
