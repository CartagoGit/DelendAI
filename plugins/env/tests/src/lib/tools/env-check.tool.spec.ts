import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { captureToolRegistration } from '../../../../../../tools/scripts/lib/test-mcp-server';
import { buildEnvCheckRegistration } from '../../../../src/lib/tools/env-check.tool';

describe('env_check tool', () => {
	it('reads a .env file under the workspace root when no deps override is supplied', async () => {
		const workspaceRootAbs = await mkdtemp(path.join(tmpdir(), 'env-ws-'));
		try {
			await writeFile(
				path.join(workspaceRootAbs, '.env'),
				'FOO=bar\n',
				'utf8',
			);
			const captured = await captureToolRegistration(
				buildEnvCheckRegistration({
					namespacePrefix: 'mcp',
					workspaceRootAbs,
				}),
			);
			const out = (await captured.invoke({})) as { found: boolean };
			expect(out.found).toBe(true);
		} finally {
			await rm(workspaceRootAbs, { recursive: true, force: true });
		}
	});

	// x00168 (S3): `path` used to hand-roll
	// `isAbsolute(path) ? path : join(root, path)` — honoring an absolute
	// or escaping path unconditionally.
	it('rejects a path that escapes the workspace when no deps override is supplied', async () => {
		const workspaceRootAbs = await mkdtemp(path.join(tmpdir(), 'env-ws-'));
		try {
			const captured = await captureToolRegistration(
				buildEnvCheckRegistration({
					namespacePrefix: 'mcp',
					workspaceRootAbs,
				}),
			);
			const out = (await captured.invoke({
				path: '../../../../etc/passwd',
			})) as { error?: unknown };
			expect(out.error).toBeDefined();
		} finally {
			await rm(workspaceRootAbs, { recursive: true, force: true });
		}
	});

	it('rejects an absolute path when no deps override is supplied', async () => {
		const workspaceRootAbs = await mkdtemp(path.join(tmpdir(), 'env-ws-'));
		try {
			const captured = await captureToolRegistration(
				buildEnvCheckRegistration({
					namespacePrefix: 'mcp',
					workspaceRootAbs,
				}),
			);
			const out = (await captured.invoke({
				path: '/etc/passwd',
			})) as { error?: unknown };
			expect(out.error).toBeDefined();
		} finally {
			await rm(workspaceRootAbs, { recursive: true, force: true });
		}
	});
});
