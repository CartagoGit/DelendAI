#!/usr/bin/env bun
/**
 * Proves the documented external path from publishable tarballs, not from
 * workspace aliases: build → pack → install → init → MCP handshake.
 */
import { spawnSync } from 'node:child_process';
import {
	mkdtempSync,
	mkdirSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

import { buildCanonicalLaunch } from '../../../packages/cli/src/lib/server-args.service';
import { PUBLISH_ORDER } from '../release/release-plan';

const ROOT = resolve(import.meta.dir, '../../..');
const TIMEOUT_MS = 30_000;

interface IPackageManifest {
	readonly name: string;
}

interface IWrittenMcpConfig {
	readonly mcpServers?: Readonly<
		Record<
			string,
			{
				readonly command?: unknown;
				readonly args?: unknown;
			}
		>
	>;
}

const run = (command: string, args: readonly string[], cwd: string): string => {
	// Bootstrap invariant: every agent/tool shell goes through a clean bash.
	// `exec "$@"` passes argv without interpolation, so paths remain safe.
	const result = spawnSync(
		'/bin/bash',
		[
			'--noprofile',
			'--norc',
			'-c',
			'exec "$@"',
			'mcpv-smoke',
			command,
			...args,
		],
		{
			cwd,
			encoding: 'utf8',
			stdio: ['ignore', 'pipe', 'pipe'],
			timeout: 120_000,
		},
	);
	if (result.status !== 0) {
		throw new Error(
			`${command} ${args.join(' ')} failed (${result.status ?? 'signal'}):\n${result.stderr || result.stdout}`,
		);
	}
	return result.stdout;
};

const withTimeout = async <T>(
	promise: Promise<T>,
	label: string,
): Promise<T> => {
	let timer: ReturnType<typeof setTimeout> | undefined;
	try {
		return await Promise.race([
			promise,
			new Promise<never>((_resolve, reject) => {
				timer = setTimeout(
					() =>
						reject(
							new Error(
								`${label} timed out after ${TIMEOUT_MS}ms`,
							),
						),
					TIMEOUT_MS,
				);
			}),
		]);
	} finally {
		if (timer !== undefined) clearTimeout(timer);
	}
};

const readJson = <T>(path: string): T =>
	JSON.parse(readFileSync(path, 'utf8')) as T;

const main = async (): Promise<void> => {
	const scratch = mkdtempSync(join(tmpdir(), 'mcp-vertex-external-'));
	const tarballsDir = join(scratch, 'tarballs');
	const project = join(scratch, 'consumer');
	try {
		mkdirSync(tarballsDir, { recursive: true });
		run(
			'bun',
			['tools/scripts/compile/build.script.ts', ...PUBLISH_ORDER],
			ROOT,
		);

		const dependencies: Record<string, string> = {};
		for (const packageDir of PUBLISH_ORDER) {
			const absoluteDir = join(ROOT, packageDir);
			const manifest = readJson<IPackageManifest>(
				join(absoluteDir, 'package.json'),
			);
			const filename = `${manifest.name.replace('@', '').replace('/', '-')}.tgz`;
			run(
				'bun',
				[
					'pm',
					'pack',
					'--filename',
					join(tarballsDir, filename),
					'--ignore-scripts',
					'--quiet',
				],
				absoluteDir,
			);
			dependencies[manifest.name] = `file:${join(tarballsDir, filename)}`;
		}

		mkdirSync(project, { recursive: true });
		writeFileSync(
			join(project, 'package.json'),
			`${JSON.stringify(
				{
					name: 'mcp-vertex-external-smoke',
					private: true,
					type: 'module',
					dependencies,
				},
				null,
				'\t',
			)}\n`,
		);
		run(
			'npm',
			['install', '--ignore-scripts', '--no-audit', '--no-fund'],
			project,
		);

		const installedBin = join(project, 'node_modules', '.bin', 'mcpv');
		run('bun', [installedBin, 'init', '--force'], project);

		const config = readJson<IWrittenMcpConfig>(join(project, '.mcp.json'));
		const written = config.mcpServers?.['mcp-vertex'];
		if (
			typeof written?.command !== 'string' ||
			!Array.isArray(written.args) ||
			!written.args.every((arg) => typeof arg === 'string')
		) {
			throw new Error('init did not write a valid .mcp.json stdio entry');
		}

		const expected = buildCanonicalLaunch({ workspace: '.' });
		if (
			written.command !== expected.command ||
			JSON.stringify(written.args) !== JSON.stringify(expected.args)
		) {
			throw new Error(
				`init launch drifted from buildCanonicalLaunch:\nwritten=${JSON.stringify(written)}\nexpected=${JSON.stringify(expected)}`,
			);
		}

		const transport = new StdioClientTransport({
			command: written.command,
			args: written.args as string[],
			cwd: project,
			stderr: 'pipe',
		});
		const client = new Client(
			{ name: 'mcp-vertex-external-smoke', version: '0.0.0' },
			{ capabilities: {} },
		);
		try {
			await withTimeout(client.connect(transport), 'MCP connect');
			const result = (await withTimeout(
				client.callTool({
					name: 'mcp-vertex_overview',
					arguments: { compact: true },
				}),
				'overview call',
			)) as { readonly isError?: boolean; readonly content?: unknown[] };
			if (
				result.isError ||
				!Array.isArray(result.content) ||
				result.content.length === 0
			) {
				throw new Error(
					'installed server returned no overview payload',
				);
			}
		} finally {
			await client.close().catch(() => undefined);
		}

		process.stdout.write(
			`✓ external install smoke: ${PUBLISH_ORDER.length} tarballs installed; init launch completed an MCP overview handshake.\n`,
		);
	} finally {
		rmSync(scratch, { recursive: true, force: true });
	}
};

await main().catch((error: unknown) => {
	process.stderr.write(
		`✖ external install smoke failed: ${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`,
	);
	process.exitCode = 1;
});
