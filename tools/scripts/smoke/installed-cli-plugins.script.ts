#!/usr/bin/env bun
/**
 * Proves that a project which installs only the published CLI gets every
 * plugin `init` writes into its configuration, and that the server activates
 * each one and fills each host folder with its skills. The packages come from
 * packed tarballs served by a local registry (`local-registry.helper.ts`),
 * never from the monorepo's sources, whose resolution hides a missing
 * dependency. Run after `bun run build`.
 */
import { spawn } from 'node:child_process';
import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	readdirSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { parse } from 'jsonc-parser';

import { AGENT_HOSTS } from '@delendai/core/cli';
import {
	packPublishablePackages,
	serveLocalRegistry,
} from './local-registry.helper.ts';

const ROOT = resolve(import.meta.dir, '../../..');
const TIMEOUT_MS = 60_000;
// Every host that keeps skills in a folder, from the one list of hosts.
const SKILL_HOSTS = AGENT_HOSTS.flatMap((host) =>
	host.skills === undefined
		? []
		: [{ skills: host.skills.dir, evidence: host.evidence.paths[0] }],
);
const HOST_SKILL_DIRS = SKILL_HOSTS.map((host) => host.skills);

/** Async: the local registry shares this event loop, so it must stay free. */
const run = (
	command: string,
	args: readonly string[],
	cwd: string,
	env: NodeJS.ProcessEnv,
): Promise<string> =>
	new Promise((done, fail) => {
		const child = spawn(command, [...args], {
			cwd,
			env,
			stdio: ['ignore', 'pipe', 'pipe'],
		});
		let out = '';
		child.stdout.on('data', (chunk) => (out += String(chunk)));
		child.stderr.on('data', (chunk) => (out += String(chunk)));
		child.on('error', fail);
		child.on('close', (status) =>
			status === 0
				? done(out)
				: fail(
						new Error(
							`${command} ${args.join(' ')} failed (${status}):\n${out}`,
						),
					),
		);
	});

const skillFolders = (dir: string): readonly string[] =>
	existsSync(dir)
		? readdirSync(dir, { withFileTypes: true })
				.filter(
					(entry) =>
						entry.isDirectory() &&
						existsSync(join(dir, entry.name, 'SKILL.md')),
				)
				.map((entry) => entry.name)
		: [];

const main = async (): Promise<void> => {
	const scratch = mkdtempSync(join(tmpdir(), 'delendai-installed-cli-'));
	const project = join(scratch, 'consumer');
	const home = join(scratch, 'home');
	mkdirSync(project, { recursive: true });
	mkdirSync(home, { recursive: true });
	const registry = await serveLocalRegistry(
		await packPublishablePackages(ROOT, scratch, join(scratch, 'tarballs')),
	);
	const env: NodeJS.ProcessEnv = {
		...process.env,
		HOME: home,
		USERPROFILE: home,
		XDG_CONFIG_HOME: join(home, '.config'),
		APPDATA: join(home, 'AppData', 'Roaming'),
	};
	try {
		const cli = JSON.parse(
			readFileSync(join(ROOT, 'packages/cli/package.json'), 'utf8'),
		) as { version: string };
		// The only dependency the consumer names is the CLI itself.
		writeFileSync(
			join(project, 'package.json'),
			`${JSON.stringify({ name: 'installed-cli-plugins', private: true, type: 'module', dependencies: { '@delendai/cli': cli.version } }, null, '\t')}\n`,
		);
		writeFileSync(
			join(project, '.npmrc'),
			`@delendai:registry=${registry.url}\n`,
		);
		// One folder per host the project uses, so each gets its skills.
		for (const host of SKILL_HOSTS) {
			if (
				host.evidence !== undefined &&
				!host.evidence.includes('.', 1)
			) {
				mkdirSync(join(project, host.evidence), { recursive: true });
			}
		}
		await run(
			'npm',
			['install', '--ignore-scripts', '--no-audit', '--no-fund'],
			project,
			env,
		);

		const bin = join(project, 'node_modules', '.bin', 'delendai');
		await run('node', [bin, 'init', '--force'], project, env);
		const config = parse(
			readFileSync(join(project, 'delendai.config.json'), 'utf8'),
		) as { plugins?: Record<string, { enabled?: boolean }> };
		const configured = Object.entries(config.plugins ?? {})
			.filter(([, value]) => value.enabled !== false)
			.map(([id]) => id);
		if (configured.length === 0) {
			throw new Error(
				'init wrote no enabled plugin into delendai.config.json',
			);
		}
		const unresolved = configured.filter(
			(id) =>
				!existsSync(
					join(
						project,
						'node_modules',
						'@delendai',
						id,
						'package.json',
					),
				),
		);
		if (unresolved.length > 0) {
			throw new Error(
				`init configures plugins the installed CLI did not bring: ${unresolved.join(', ')}`,
			);
		}

		let stderr = '';
		const transport = new StdioClientTransport({
			command: 'node',
			args: [bin, '__serve', '--workspace', project, '--surface=native'],
			cwd: project,
			env: env as Record<string, string>,
			stderr: 'pipe',
		});
		transport.stderr?.on('data', (chunk: Buffer | string) => {
			stderr += String(chunk);
		});
		const client = new Client(
			{ name: 'installed-cli-plugins', version: '0.0.0' },
			{ capabilities: {} },
		);
		try {
			await client.connect(transport, { timeout: TIMEOUT_MS });
			const result = (await client.callTool({
				name: 'delendai_overview',
				arguments: { compact: true },
			})) as {
				structuredContent?: { plugins?: unknown };
				content?: { text?: string }[];
			};
			const payload =
				result.structuredContent ??
				(JSON.parse(result.content?.[0]?.text ?? '{}') as {
					plugins?: unknown;
				});
			const active = new Set(
				((payload.plugins ?? []) as (string | { name: string })[]).map(
					(plugin) =>
						typeof plugin === 'string' ? plugin : plugin.name,
				),
			);
			const inactive = configured.filter((id) => !active.has(id));
			if (inactive.length > 0) {
				throw new Error(
					`the server did not activate: ${inactive.join(', ')}`,
				);
			}
		} catch (error) {
			throw new Error(
				`${error instanceof Error ? error.message : String(error)}\nserver stderr:\n${stderr}`,
			);
		} finally {
			await client.close().catch(() => undefined);
		}

		const empty = HOST_SKILL_DIRS.filter(
			(dir) => skillFolders(join(project, dir)).length === 0,
		);
		if (empty.length > 0) {
			throw new Error(
				`host folder(s) hold no skill: ${empty.join(', ')}`,
			);
		}
		process.stdout.write(
			`✓ installed CLI: ${configured.length} configured plugins resolved from tarballs and active; ${HOST_SKILL_DIRS.map((dir) => `${dir} ${skillFolders(join(project, dir)).length}`).join(', ')} skills.\n`,
		);
	} finally {
		registry.stop();
		rmSync(scratch, { recursive: true, force: true });
	}
};

await main().catch((error: unknown) => {
	process.stderr.write(
		`✖ installed CLI plugins smoke failed: ${error instanceof Error ? error.message : String(error)}\n`,
	);
	process.exitCode = 1;
});
