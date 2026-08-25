#!/usr/bin/env bun
import { assembleCliConfig } from '@mcp-vertex/core/lib/cli/assemble';
import { parseCliArgs } from '@mcp-vertex/core/lib/plugins/parse-cli-args';
import { measureBootstrapBytes } from '@mcp-vertex/core/lib/surface/bootstrap';

const MODES = ['native', 'adaptive', 'compact'] as const;

const main = async (): Promise<number> => {
	const workspace = process.cwd();
	const rows = [] as Array<{
		mode: (typeof MODES)[number];
		tools: number;
		bytes: number;
		estimatedTokens: number;
	}>;

	for (const mode of MODES) {
		const args = parseCliArgs(
			[`--surface=${mode}`, `--workspace=${workspace}`],
			workspace,
		);
		const { config } = await assembleCliConfig(args);
		const measurement = measureBootstrapBytes(
			config.toolSurfacePlan?.descriptors ?? [],
		);
		rows.push({ mode, ...measurement });
	}

	console.log('Bootstrap bytes by surface mode:');
	for (const row of rows) {
		console.log(
			`${row.mode}: ${row.tools} tools, ${row.bytes} B, ~${row.estimatedTokens} tokens`,
		);
	}

	const adaptive = rows.find((row) => row.mode === 'adaptive');
	if (adaptive !== undefined && adaptive.bytes > 50_000) {
		console.error(`Adaptive bootstrap exceeds 50 KB: ${adaptive.bytes} B`);
		return 1;
	}

	return 0;
};

const exitCode = await main();
process.exit(exitCode);
