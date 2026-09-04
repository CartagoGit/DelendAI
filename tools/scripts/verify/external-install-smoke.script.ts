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
import {
	packRewrittenTarball,
	stageBuildForPublish,
	type IWorkspaceDepsPlan,
} from '../publish/workspace-deps.ts';

const ROOT = resolve(import.meta.dir, '../../..');
const TIMEOUT_MS = 30_000;

interface IPackageManifest {
	readonly name: string;
	readonly version: string;
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

interface IToolCallResult {
	readonly isError?: boolean;
	readonly structuredContent?: Record<string, unknown>;
	readonly content?: readonly {
		readonly type?: string;
		readonly text?: string;
	}[];
}

const structured = (result: IToolCallResult): Record<string, unknown> => {
	if (result.structuredContent !== undefined) return result.structuredContent;
	const text = result.content?.find((entry) => entry.type === 'text')?.text;
	if (text === undefined)
		throw new Error('MCP tool returned no structured payload');
	return JSON.parse(text) as Record<string, unknown>;
};

const routedPayload = (result: IToolCallResult): Record<string, unknown> => {
	const outer = structured(result);
	const nested = outer.structuredContent;
	return nested !== null &&
		typeof nested === 'object' &&
		!Array.isArray(nested)
		? (nested as Record<string, unknown>)
		: outer;
};

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
	// stderr carries the human recap (init's "What's next" block) —
	// return both streams so callers can assert on operator-facing copy.
	return `${result.stdout}\n${result.stderr}`;
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

		// r00045 S1: `bun run build` writes only under `build/{group}/{name}/
		// {version}/` now, never a per-package `dist/`. Manifests still
		// declare `"main"/"bin": "./dist/..."` (npm/Node forbid `exports`
		// escaping the package directory with `../build`) — per the
		// proposal's design note, the publish pipeline stages that
		// `build/` slice into a per-package `dist/` in a throwaway COPY
		// before packing, exactly as `release.script.ts` does. Packing the
		// raw workspace dir (as this used to do) packs a manifest whose
		// `./dist/...` entrypoint was never written on disk, so the
		// installed `mcpv` bin resolves to nothing.
		//
		// The staged copy also can't be packed with `bun pm pack` (as
		// before): bun resolves `workspace:*` ranges by walking up to the
		// monorepo's workspace root, which a `/tmp` staging copy isn't part
		// of. `packRewrittenTarball` sidesteps that entirely — it rewrites
		// `workspace:*` to the dependency's real version itself (the same
		// helper `release.script.ts`'s npm publish path and
		// `pack.script.ts`'s pack-smoke use) and packs with plain `npm
		// pack`, which needs no workspace context.
		const stagingDir = join(scratch, 'staging');
		mkdirSync(stagingDir, { recursive: true });
		const manifests = new Map(
			PUBLISH_ORDER.map(
				(packageDir) =>
					[
						packageDir,
						readJson<IPackageManifest>(
							join(ROOT, packageDir, 'package.json'),
						),
					] as const,
			),
		);
		const workspacePlan: IWorkspaceDepsPlan = {
			packageVersions: new Map(
				[...manifests.values()].map(
					(manifest) => [manifest.name, manifest.version] as const,
				),
			),
		};
		const dependencies: Record<string, string> = {};
		for (const packageDir of PUBLISH_ORDER) {
			const absoluteDir = join(ROOT, packageDir);
			const manifest = manifests.get(packageDir);
			if (manifest === undefined) {
				throw new Error(`missing manifest for ${packageDir}`);
			}
			const group = packageDir.startsWith('packages/')
				? 'packages'
				: 'plugins';
			const name = packageDir.slice(packageDir.indexOf('/') + 1);
			const buildDir = join(ROOT, 'build', group, name, manifest.version);
			const stageDir = join(stagingDir, packageDir);
			await stageBuildForPublish(absoluteDir, buildDir, stageDir);

			const tarballPath = await packRewrittenTarball(
				stageDir,
				workspacePlan,
				{ outDir: tarballsDir },
			);
			dependencies[manifest.name] = `file:${tarballPath}`;
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
		const initOutput = run(
			'bun',
			[installedBin, 'init', '--force'],
			project,
		);

		// x00102 S3: the recap's "What's next" must give runnable steps —
		// regression guard for the `.gitkeep`-instead-of-proposal bug and
		// the invalid `bun mcpv …` hint.
		if (initOutput.includes('open .gitkeep')) {
			throw new Error(
				"init What's-next linked .gitkeep instead of the adoption proposal",
			);
		}
		if (initOutput.includes('bun mcpv ')) {
			throw new Error(
				"init What's-next suggested the non-runnable `bun mcpv …` form",
			);
		}

		const config = readJson<IWrittenMcpConfig>(join(project, '.mcp.json'));
		const written = config.mcpServers?.['mcp-vertex'];
		if (
			typeof written?.command !== 'string' ||
			!Array.isArray(written.args) ||
			!written.args.every((arg) => typeof arg === 'string')
		) {
			throw new Error('init did not write a valid .mcp.json stdio entry');
		}

		// Keep this smoke intentionally small and consumer-like. `init` proves
		// the full preset can be rendered, while the installed-server checks
		// below isolate the portable package path with one published plugin.
		writeFileSync(
			join(project, 'mcp-vertex.config.json'),
			`${JSON.stringify(
				{
					$schema:
						'https://unpkg.com/@delendai/core/schema/mcp-vertex.config.schema.json',
					surfaceMode: 'managed',
					managedSurface: { loading: 'lazy' },
					startupReport: { level: 'full', color: 'never' },
					plugins: {
						proposals: { options: {} },
						'prompts-pack': { options: {} },
					},
				},
				null,
				2,
			)}\n`,
		);
		mkdirSync(
			join(project, '.mcp-vertex', 'skills', 'mcp-vertex-operator'),
			{
				recursive: true,
			},
		);
		writeFileSync(
			join(
				project,
				'.mcp-vertex',
				'skills',
				'mcp-vertex-operator',
				'SKILL.md',
			),
			'---\nname: mcp-vertex-operator\ndescription: Consumer override\n---\nWORKSPACE OVERRIDE\n',
		);

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
			// The generated host entry is intentionally `bunx`-portable and is
			// asserted above. For this smoke, execute the freshly installed bin
			// directly so a global/cache copy can never mask a broken tarball.
			command: installedBin,
			args: ['__serve', '--workspace', project],
			cwd: project,
			stderr: 'pipe',
		});
		let childStderr = '';
		transport.stderr?.on('data', (chunk: Buffer | string) => {
			childStderr += String(chunk);
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
					arguments: { compact: true, activation: true },
				}),
				'overview call',
			)) as IToolCallResult;
			if (
				result.isError ||
				!Array.isArray(result.content) ||
				result.content.length === 0
			) {
				throw new Error(
					'installed server returned no overview payload',
				);
			}
			const overview = structured(result);
			const context = overview.projectContext as
				| {
						surfaceMode?: string;
						visibleToolCount?: number;
						loadedToolCount?: number;
				  }
				| undefined;
			if (
				context?.surfaceMode !== 'managed' ||
				typeof context.visibleToolCount !== 'number' ||
				typeof context.loadedToolCount !== 'number' ||
				context.loadedToolCount <= context.visibleToolCount
			) {
				throw new Error(
					`managed overview counts are not honest: ${JSON.stringify(context)}`,
				);
			}

			const listed = await withTimeout(client.listTools(), 'tools/list');
			if (listed.tools.length >= context.loadedToolCount) {
				throw new Error(
					`managed tools/list is not compact: ${listed.tools.length} visible vs ${context.loadedToolCount} loaded`,
				);
			}
			if (
				!listed.tools.some((tool) => tool.name === 'mcp-vertex_vertex')
			) {
				throw new Error(
					'managed tools/list omitted the internal router',
				);
			}
			if (listed.tools.some((tool) => tool.name === 'mcp-vertex_skill')) {
				throw new Error(
					'managed tools/list leaked the internal skill tool',
				);
			}

			const activation = (await withTimeout(
				client.callTool({
					name: 'mcp-vertex_plugin_activate',
					arguments: { plugin: 'prompts-pack' },
				}),
				'prompt plugin activation',
			)) as IToolCallResult;
			if (activation.isError) {
				throw new Error('managed prompt plugin activation failed');
			}
			const prompts = await withTimeout(
				client.listPrompts(),
				'prompt list after lazy activation',
			);
			if (
				!prompts.prompts.some(
					(prompt) =>
						prompt.name ===
						'mcp-vertex_prompts-pack_explain-this-code',
				)
			) {
				throw new Error('lazy plugin prompt was not registered');
			}
			const resources = await withTimeout(
				client.listResources(),
				'resource list after lazy activation',
			);
			if (
				!resources.resources.some(
					(resource) =>
						resource.uri === 'knowledge://prompts-pack-overview',
				)
			) {
				throw new Error(
					'lazy plugin knowledge resource was not registered',
				);
			}

			const compactSkills = routedPayload(
				(await withTimeout(
					client.callTool({
						name: 'mcp-vertex_vertex',
						arguments: {
							domain: 'core',
							action: 'skill',
							args: {},
						},
					}),
					'compact skill call',
				)) as IToolCallResult,
			);
			const compactSkillRows = compactSkills as
				| { skills?: readonly { id?: string }[] }
				| undefined;
			if (
				!compactSkillRows?.skills?.some(
					(skill) => skill.id === 'mcp-vertex-operator',
				)
			) {
				throw new Error(
					'portable core skill was not listed with its canonical id',
				);
			}

			const workspaceSkill = routedPayload(
				(await withTimeout(
					client.callTool({
						name: 'mcp-vertex_vertex',
						arguments: {
							domain: 'core',
							action: 'skill',
							args: { id: 'mcp-vertex-operator' },
						},
					}),
					'workspace skill call',
				)) as IToolCallResult,
			);
			if (
				!String(workspaceSkill.body ?? '').includes(
					'WORKSPACE OVERRIDE',
				)
			) {
				throw new Error(
					`workspace skill did not win package precedence: ${JSON.stringify(workspaceSkill)}`,
				);
			}

			const pluginSkill = routedPayload(
				(await withTimeout(
					client.callTool({
						name: 'mcp-vertex_vertex',
						arguments: {
							domain: 'core',
							action: 'skill',
							args: { id: 'mcp-vertex-proposal-swarm-runner' },
						},
					}),
					'plugin skill call',
				)) as IToolCallResult,
			);
			if (
				!String(pluginSkill.body ?? '').includes(
					'canonical proposals workflow',
				)
			) {
				throw new Error('published plugin skill body was not loadable');
			}
			const routedSkill = structured(
				(await withTimeout(
					client.callTool({
						name: 'mcp-vertex_vertex',
						arguments: {
							domain: 'core',
							action: 'skill',
							args: { id: 'mcp-vertex-operator' },
						},
					}),
					'routed internal call',
				)) as IToolCallResult,
			);
			if (routedSkill.routed !== true || routedSkill.active !== false) {
				throw new Error(
					'hidden internal tool was not callable through the router',
				);
			}
			const lazyPluginCall = (await withTimeout(
				client.callTool({
					name: 'mcp-vertex_vertex',
					arguments: {
						domain: 'proposals',
						action: 'get_proposal_workflow',
						args: {},
					},
				}),
				'lazy plugin route call',
			)) as IToolCallResult;
			if (lazyPluginCall.isError) {
				throw new Error(
					`managed lazy plugin route failed: ${JSON.stringify(lazyPluginCall)}`,
				);
			}
			if (!/module loading\s+lazy/u.test(childStderr)) {
				throw new Error(
					`startup report did not record lazy module loading:\n${childStderr}`,
				);
			}
		} catch (error) {
			throw new Error(
				`${error instanceof Error ? error.message : String(error)}\ninstalled server stderr:\n${childStderr}`,
			);
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
