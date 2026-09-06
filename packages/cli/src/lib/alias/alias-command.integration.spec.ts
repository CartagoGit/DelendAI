/**
 * alias-command.integration.spec.ts — b00239 S7 vertical test.
 *
 * Drives the CLI `alias` subcommand end-to-end through
 * `createAliasCommand({ io, resolveLaunch }).run(...)`, with
 * production `createNodeAliasIo()` and a stub canonical-launch
 * resolver pointing into a per-test tmp dir.
 *
 * This is the regression for the reviewer's points 15-18: the
 * previous incarnation constructed a `fakeIo()` stub inside
 * `alias.command.ts` that was a no-op for `write` / `remove`
 * and always returned `false` from `exists` / `undefined` from
 * `read`. The pre-fix test (`integration.spec.ts`) only
 * exercised `installAlias` against an in-test IAliasIo and
 * missed the CLI glue layer. THIS test routes through the CLI
 * command boundary so a regression that re-introduces a
 * fakeIo-style stub in `alias.command.ts` will fail here.
 */

import { mkdir, mkdtemp, readFile, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import type { ICliCommandContext } from '../../contracts/interfaces/cli-command.interface';
import { createAliasCommand } from '../../commands/alias.command';
import { ALIAS_MARKER } from '../../contracts/constants/alias.constant';
import { createNodeAliasIo } from './io-real';

const mkCtx = (cwd: string): ICliCommandContext => ({
	cwd,
	globals: {
		workspace: cwd,
		json: false,
		format: 'text',
		lang: 'en',
		noColor: true,
		plugins: [],
	},
	// ICliCommandContext now requires an MCP bridge (request / listTools /
	// close). The alias command doesn't invoke any tool, so we stub all
	// three with safe no-ops; an integration that actually calls a tool
	// would need a fake MCP server.
	request: async <TOut>() => undefined as unknown as TOut,
	listTools: async () => [],
	close: async () => {},
});

const buildLaunch = (canonical: string, binDir: string) => () => ({
	canonicalPath: canonical,
	binDir,
	source: 'meta-url' as const,
});

describe('alias command — vertical integration (b00239 S7)', () => {
	it('install writes the shim, status reports ours, remove cleans up', async () => {
		const tmp = await mkdtemp(join(tmpdir(), 'alias-cmd-int-'));
		const io = createNodeAliasIo();
		const launch = buildLaunch(join(tmp, 'delendai'), tmp);
		const cmd = createAliasCommand({ io, resolveLaunch: launch });
		const ctx = mkCtx(tmp);

		// status before any install: absent.
		const before = (await cmd.run(['alias', 'status'], ctx)) as {
			code: number;
			data?: { state: string };
		};
		expect(before.code).toBe(0);
		expect(before.data?.state).toBe('absent');

		// install: creates the shim with the marker.
		const installed = (await cmd.run(['alias', 'install'], ctx)) as {
			code: number;
			data?: { action: string; status: { state: string } };
		};
		expect(installed.code).toBe(0);
		expect(installed.data?.action).toBe('created');
		expect(installed.data?.status.state).toBe('ours');

		const path = join(tmp, 'est');
		const contents = await readFile(path, 'utf8');
		expect(contents).toContain(ALIAS_MARKER);
		expect(contents).toContain(launch().canonicalPath);

		// status: ours.
		const after = (await cmd.run(['alias', 'status'], ctx)) as {
			code: number;
			data?: { state: string };
		};
		expect(after.data?.state).toBe('ours');

		// remove: status flips to absent, file is gone.
		const removed = (await cmd.run(['alias', 'remove'], ctx)) as {
			code: number;
			data?: { action: string; status: { state: string } };
		};
		expect(removed.code).toBe(0);
		expect(removed.data?.action).toBe('created');
		expect(removed.data?.status.state).toBe('absent');
		await expect(stat(path)).rejects.toThrow();
	});

	it('foreign file is never overwritten via the CLI surface', async () => {
		const tmp = await mkdtemp(join(tmpdir(), 'alias-cmd-int-foreign-'));
		const io = createNodeAliasIo();
		const launch = buildLaunch(join(tmp, 'delendai'), tmp);
		const cmd = createAliasCommand({ io, resolveLaunch: launch });
		const ctx = mkCtx(tmp);

		const foreignPath = join(tmp, 'est');
		const foreignContents = '#!/bin/sh\necho "another program"\n';
		await io.write(foreignPath, foreignContents);

		const installed = (await cmd.run(['alias', 'install'], ctx)) as {
			code: number;
			data?: { action: string; status: { state: string } };
		};
		expect(installed.code).toBe(0);
		expect(installed.data?.action).toBe('refused');
		expect(installed.data?.status.state).toBe('foreign');

		const after = await readFile(foreignPath, 'utf8');
		expect(after).toBe(foreignContents);
	});

	it('unknown subcommand returns USAGE, not a hang', async () => {
		const tmp = await mkdtemp(join(tmpdir(), 'alias-cmd-int-usage-'));
		const io = createNodeAliasIo();
		const launch = buildLaunch(join(tmp, 'delendai'), tmp);
		const cmd = createAliasCommand({ io, resolveLaunch: launch });
		const ctx = mkCtx(tmp);

		const result = (await cmd.run(['alias', 'frobnicate'], ctx)) as {
			code: number;
			error?: string;
		};
		expect(result.code).not.toBe(0);
		expect(result.error).toContain('unknown alias subcommand');
	});

	it('CLI honours DELENDAI_ALIAS_BIN_DIR override', async () => {
		const tmp = await mkdtemp(join(tmpdir(), 'alias-cmd-int-override-'));
		const customBin = join(tmp, 'custom-bin');
		await mkdir(customBin, { recursive: true });
		const io = createNodeAliasIo();
		const launch = buildLaunch(join(tmp, 'delendai'), tmp);
		const cmd = createAliasCommand({ io, resolveLaunch: launch });
		const ctx = mkCtx(tmp);
		process.env['DELENDAI_ALIAS_BIN_DIR'] = customBin;

		try {
			const installed = (await cmd.run(['alias', 'install'], ctx)) as {
				code: number;
				data?: {
					action: string;
					status: { state: string; path: string };
				};
			};
			expect(installed.data?.action).toBe('created');
			expect(installed.data?.status.state).toBe('ours');
			expect(installed.data?.status.path).toBe(join(customBin, 'est'));
			const st = await stat(join(customBin, 'est'));
			expect(st.isFile()).toBe(true);
		} finally {
			delete process.env['DELENDAI_ALIAS_BIN_DIR'];
		}
	});
});
