/**
 * assemble.client-identity-and-hook-errors.spec.ts — what the assembler
 * hands every plugin: the client's name once the handshake has told it,
 * and the failure of a sibling's observer, whichever plugin raised it.
 */

import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { assembleCliConfig } from '@delendai/core/lib/cli/assemble';
import { parseCliArgs } from '@delendai/core/lib/plugins/parse-cli-args';

let workspace: string;

const config = JSON.stringify({
	plugins: [{ name: 'logs', enabled: true }],
	managedSurface: { loading: 'eager' },
});

const fileReader = async (absolutePath: string): Promise<string | undefined> =>
	absolutePath.endsWith('delendai.config.json') ? config : undefined;

interface ISeenContext {
	readonly clientIdentity: { name(): string | undefined };
}

beforeEach(async () => {
	workspace = await mkdtemp(join(tmpdir(), 'assemble-client-identity-'));
	await writeFile(join(workspace, 'package.json'), '{"name":"x"}', 'utf8');
});

afterEach(async () => {
	vi.restoreAllMocks();
	await rm(workspace, { recursive: true, force: true });
});

const assemble = async (
	register: (context: ISeenContext) => Record<string, unknown>,
) =>
	assembleCliConfig(parseCliArgs(['--workspace', workspace], workspace), {
		readFile: fileReader,
		import: async () => ({
			default: {
				name: 'logs',
				register: (context: ISeenContext) => register(context),
			},
		}),
	});

describe('the client identity a plugin sees', () => {
	it('is unknown until the handshake and the client name after it', async () => {
		let seen: ISeenContext | undefined;
		const assembled = await assemble((context) => {
			seen = context;
			return {};
		});

		expect(seen?.clientIdentity.name()).toBeUndefined();
		assembled.config.onClientInitialized?.({
			name: 'cursor',
			version: '1.0.0',
		});
		expect(seen?.clientIdentity.name()).toBe('cursor');
	});
});

describe('a plugin that watches hook failures', () => {
	it('is told which hook failed, and a watcher that throws does not stop the next', async () => {
		const stderr = vi
			.spyOn(process.stderr, 'write')
			.mockImplementation(() => true);
		const told: unknown[] = [];
		const assembled = await assemble(() => ({
			onToolStart: () => {
				throw new Error('boom: onToolStart refuses');
			},
			onHookError: (info: unknown) => {
				told.push(info);
				throw new Error('boom: the watcher refuses too');
			},
		}));

		await expect(
			assembled.config.onToolStart?.('some_tool', { a: 1 }),
		).resolves.toBeUndefined();

		expect(told).toHaveLength(1);
		expect(told[0]).toMatchObject({
			hookName: 'onToolStart',
			toolName: 'some_tool',
		});
		const written = stderr.mock.calls
			.map(([line]) => String(line))
			.join('');
		expect(written).toContain('onHookError error (logs)');
		expect(written).toContain('the watcher refuses too');
	});
});
