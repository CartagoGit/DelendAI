/**
 * generate-tool-types.ts — N23 generated tool-output SDK.
 *
 * Assembles the canonical reference server (every shipped plugin),
 * harvests each tool's Zod `outputSchema`, converts it to JSON Schema
 * via `z.toJSONSchema` (Zod v4, zero extra deps) and writes one
 * `src/generated/tool-outputs.ts` per package using the pure emitter in
 * `emit-tool-types.ts`.
 *
 *     bun run types:generate          # write the files
 *
 * The pure routing/emitting lives in `emit-tool-types.ts`; the only
 * impure parts here are assembling the server and writing files. The
 * harvester is exported so the drift-guard test can compare the
 * checked-in files against a fresh in-memory generation.
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { z } from 'zod';

import { assembleCliConfig } from '@mcp-vertex/core/lib/cli/assemble';
import { createMcpProject } from '@mcp-vertex/core/lib/project/create-mcp-project';
import { parseCliArgs } from '@mcp-vertex/core/lib/plugins/parse-cli-args';

import proposalsPlugin from '@mcp-vertex/proposals';
import rulesPlugin from '@mcp-vertex/rules';
import memoryPlugin from '@mcp-vertex/memory';
import gitPlugin from '@mcp-vertex/git';
import qualityPlugin from '@mcp-vertex/quality';
import searchPlugin from '@mcp-vertex/search';
import notificationPlugin from '@mcp-vertex/notification';
import docsPlugin from '@mcp-vertex/docs';
import depsPlugin from '@mcp-vertex/deps';

import { buildPackageModules, type IHarvestedTool } from './emit-tool-types';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const PLUGIN_SPECIFIERS: Readonly<Record<string, unknown>> = {
	'mcp-proposals': proposalsPlugin,
	'mcp-rules': rulesPlugin,
	'mcp-memory': memoryPlugin,
	'mcp-git': gitPlugin,
	'mcp-quality': qualityPlugin,
	'mcp-search': searchPlugin,
	'mcp-notification': notificationPlugin,
	'mcp-docs': docsPlugin,
	'mcp-deps': depsPlugin,
};

const PLUGIN_LIST =
	'proposals,rules,memory,git,quality,search,notification,docs,deps';

/**
 * Assemble the reference server with every plugin and harvest each
 * tool's output JSON Schema. Closes the server before returning so no
 * background watcher keeps the process (or the test runner) alive.
 */
export const harvestToolSchemas = async (): Promise<IHarvestedTool[]> => {
	const args = parseCliArgs(
		[`--plugins=${PLUGIN_LIST}`, `--workspace=${REPO_ROOT}`],
		REPO_ROOT,
	);
	const { config } = await assembleCliConfig(args, {
		import: async (specifier: string) => {
			const hit = Object.entries(PLUGIN_SPECIFIERS).find(([key]) =>
				specifier.includes(key),
			);
			return { default: hit ? hit[1] : undefined };
		},
		readFile: () => undefined,
	});
	const assembled = await createMcpProject(config);
	try {
		const registered = (
			assembled.server as unknown as {
				_registeredTools: Record<string, { outputSchema?: z.ZodType }>;
			}
		)._registeredTools;
		const tools: IHarvestedTool[] = [];
		for (const [name, def] of Object.entries(registered)) {
			if (def.outputSchema === undefined) continue;
			const schema = z.toJSONSchema(def.outputSchema, {
				unrepresentable: 'any',
			}) as IHarvestedTool['schema'];
			tools.push({ name, schema });
		}
		tools.sort((a, b) => a.name.localeCompare(b.name));
		return tools;
	} finally {
		await assembled.server.close();
	}
};

/** Generate the file map (path relative to repo root → content). */
export const generateToolOutputModules = async (): Promise<
	Map<string, string>
> => buildPackageModules(await harvestToolSchemas());

const main = async (): Promise<void> => {
	const modules = await generateToolOutputModules();
	for (const [relPath, content] of modules) {
		const abs = join(REPO_ROOT, relPath);
		mkdirSync(dirname(abs), { recursive: true });
		writeFileSync(abs, content, 'utf8');
		console.log(`  wrote ${relPath}`);
	}
	console.log(`types:generate — ${modules.size} package module(s) written.`);
	// Plugins start background watchers (e.g. notification); exit explicitly.
	process.exit(0);
};

if (import.meta.main) {
	void main();
}
