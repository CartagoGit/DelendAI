#!/usr/bin/env bun
/**
 * create-plugin.ts — f00087 S2 consumer-facing script.
 *
 * Run from any workspace root:
 *   bun run tools/scripts/create-plugin.ts <plugin-name> -- "<description>"
 *
 * Generates the canonical four files for an `IMcpPlugin` package
 * (package.json, src/index.ts, tsconfig.json, README.md) under
 * `./libs/plugins/<plugin-name>/` relative to the current working
 * directory. Uses the same `scaffoldPluginFiles` generator the MCP
 * `<prefix>_scaffold` tool uses, so the generated plugin is
 * structurally identical to one produced by a host-driven scaffold.
 *
 * The script honours the `--keep-legacy` flag (after `--`): when an
 * existing file would be overwritten, it is moved under
 * `legacy/<base>-<ts>[-<n>]<ext>` first. The default is to refuse
 * (the same default the MCP scaffold tool applies without
 * `keepLegacy: true`).
 *
 * Output is a JSON line per file so a CI pipeline can drive it
 * without parsing prose.
 */
import { resolve } from 'node:path';

import {
	scaffoldPluginFiles,
	type IScaffoldPluginOptions,
} from '@mcp-vertex/core/public';
import {
	writeScaffoldedFilesOrThrow,
	type IWriteScaffoldedFilesResult,
} from '@mcp-vertex/client';

const USAGE =
	'usage: bun run tools/scripts/create-plugin.ts <plugin-name> -- "<description>" [--keep-legacy]';

interface IParseResult {
	readonly pluginName: string;
	readonly description: string;
	readonly keepLegacy: boolean;
}

const parseArgs = (argv: readonly string[]): IParseResult => {
	const args = [...argv];
	let keepLegacy = false;
	const keepIdx = args.indexOf('--keep-legacy');
	if (keepIdx >= 0) {
		keepLegacy = true;
		args.splice(keepIdx, 1);
	}
	const sepIdx = args.indexOf('--');
	const pluginName = args[0] ?? '';
	const description =
		sepIdx >= 0
			? args
					.slice(sepIdx + 1)
					.join(' ')
					.trim()
			: '';
	if (!pluginName || !description) {
		throw new Error(USAGE);
	}
	return { pluginName, description, keepLegacy };
};

const main = async (): Promise<void> => {
	const { pluginName, description, keepLegacy } = parseArgs(
		process.argv.slice(2),
	);
	const options: IScaffoldPluginOptions = {
		pluginName,
		description,
	};
	const files = scaffoldPluginFiles(options);
	const targetDir = resolve(process.cwd(), `libs/plugins/${pluginName}`);
	const result: IWriteScaffoldedFilesResult =
		await writeScaffoldedFilesOrThrow(targetDir, files, { keepLegacy });
	console.log(JSON.stringify(result, null, '\t'));
};

void main().catch((error: unknown) => {
	const message = error instanceof Error ? error.message : String(error);
	process.stderr.write(`create-plugin: ${message}\n`);
	process.exitCode = 1;
});
