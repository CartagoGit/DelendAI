/**
 * plugin-tool-registration.spec.ts
 *
 * `error_reporting_diagnose_log` existed as a fully written tool, a
 * parser and a diagnosis engine — and `register()` never returned it,
 * so at runtime the tool did not exist. Every unit test around it
 * passed. That is the recurring failure in this repo: unit-green is not
 * integrated, and nothing was asserting the seam.
 *
 * These tests exercise the real `register()` and assert the tool LIST,
 * which is the only thing a host ever sees.
 */

import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import plugin from '../src/index';

const dirs: string[] = [];

afterEach(async () => {
	await Promise.all(
		dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })),
	);
});

const registerWith = async (
	enabled: boolean,
): Promise<readonly { readonly id: string }[]> => {
	const root = await mkdtemp(join(tmpdir(), 'error-reporting-register-'));
	dirs.push(root);
	const result = await plugin.register({
		namespacePrefix: 'mcp-vertex',
		pluginCacheDir: '.cache/mcp-vertex/error-reporting',
		options: { enabled },
		workspace: {
			root,
			resolve: (relative: string) => join(root, relative),
		},
	} as never);
	return (result?.tools ?? []) as readonly { readonly id: string }[];
};

describe('error-reporting tool registration', () => {
	it('exposes diagnose_log when reporting is enabled', async () => {
		const ids = (await registerWith(true)).map((tool) => tool.id);
		expect(ids).toContain('diagnose_log');
		expect(ids).toContain('report_status');
	});

	it('still exposes diagnose_log when reporting is DISABLED', async () => {
		// Diagnosing a log is read-only and local: it sends nothing, so
		// switching reporting off must not take the diagnosis away.
		// Only the ability to open an issue is gated.
		const ids = (await registerWith(false)).map((tool) => tool.id);
		expect(ids).toContain('diagnose_log');
	});
});
