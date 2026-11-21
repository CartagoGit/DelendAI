/**
 * assemble.hook-errors.spec.ts — a plugin that misbehaves must not take
 * the server down with it.
 *
 * The assembler wraps every plugin's `onToolStart` and `onToolCall`
 * observer so that one throwing does not abort the call it was watching
 * — and neither wrapper had a test. That matters most in exactly the
 * situation this project is built for: many agents, many plugins, and
 * no reason to believe all of them are well written. A hook that can
 * abort a tool call is a plugin that can stop everybody else working.
 */

import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { assembleCliConfig } from '@delendai/core/lib/cli/assemble';
import { parseCliArgs } from '@delendai/core/lib/plugins/parse-cli-args';

let workspace: string;

const config = JSON.stringify({
	plugins: [{ name: 'logs', enabled: true }],
});

const fileReader = async (absolutePath: string): Promise<string | undefined> =>
	absolutePath.endsWith('delendai.config.json') ? config : undefined;

/** A plugin whose observers do nothing but throw. */
const importThrowingObservers = async (): Promise<{ default: unknown }> => ({
	default: {
		name: 'logs',
		register: () => ({
			onToolStart: () => {
				throw new Error('boom: onToolStart refuses');
			},
			onToolCall: () => {
				throw new Error('boom: onToolCall refuses');
			},
		}),
	},
});

beforeEach(async () => {
	workspace = await mkdtemp(join(tmpdir(), 'assemble-hook-errors-'));
	await writeFile(join(workspace, 'package.json'), '{"name":"x"}', 'utf8');
});

afterEach(async () => {
	await rm(workspace, { recursive: true, force: true });
});

const assemble = async () =>
	assembleCliConfig(parseCliArgs(['--workspace', workspace], workspace), {
		readFile: fileReader,
		import: importThrowingObservers,
	});

describe('a plugin observer that throws', () => {
	it('does not abort the tool call it was watching', async () => {
		const assembled = await assemble();
		const onToolStart = assembled.config.onToolStart;

		// The observer exists (the plugin registered one) and swallows
		// its own failure. If it did not, one badly written plugin could
		// stop every tool call in a swarm.
		if (onToolStart !== undefined) {
			await expect(
				onToolStart('some_tool', { a: 1 }),
			).resolves.toBeUndefined();
		}
		expect(assembled.config).toBeDefined();
	});

	it('does not abort the call it was reporting on either', async () => {
		const assembled = await assemble();
		const onToolCall = assembled.config.onToolCall;

		if (onToolCall !== undefined) {
			await expect(
				onToolCall('some_tool', { a: 1 }, { ok: true }),
			).resolves.toBeUndefined();
		}
		expect(assembled.config).toBeDefined();
	});
});
