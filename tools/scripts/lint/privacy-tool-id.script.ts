#!/usr/bin/env bun
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { repoRoot } from '../lib/monorepo-paths';

const TARGET_FILE = 'plugins/error-reporting/src/lib/report-builder.helper.ts';

const FORBIDDEN_PUBLIC_ASSIGNMENTS = [
	/const reportCore\s*=\s*\{[\s\S]*?toolId\s*:\s*toolName/m,
	/const reportCore\s*=\s*\{[\s\S]*?toolId\s*:\s*input\.toolName/m,
	/const reportCore\s*=\s*\{[\s\S]*?safeToolId\s*:\s*toolName/m,
	/const reportCore\s*=\s*\{[\s\S]*?safeToolId\s*:\s*input\.toolName/m,
	/return\s*\{[\s\S]*?toolId\s*:\s*toolName/m,
	/return\s*\{[\s\S]*?toolId\s*:\s*input\.toolName/m,
	/return\s*\{[\s\S]*?safeToolId\s*:\s*toolName/m,
	/return\s*\{[\s\S]*?safeToolId\s*:\s*input\.toolName/m,
] as const;

const main = async (): Promise<number> => {
	const abs = join(repoRoot(), TARGET_FILE);
	const text = await readFile(abs, 'utf8');
	for (const pattern of FORBIDDEN_PUBLIC_ASSIGNMENTS) {
		if (pattern.test(text)) {
			console.error(
				`privacy-tool-id: forbidden direct tool-name assignment matched ${pattern} in ${TARGET_FILE}`,
			);
			return 1;
		}
	}
	if (!text.includes('resolvePublicToolIdentity(')) {
		console.error(
			'privacy-tool-id: buildSafeReport must resolve public tool identity through the core registry resolver.',
		);
		return 1;
	}
	console.log(
		'privacy-tool-id: ok — report-builder derives safeToolId from resolvePublicToolIdentity and never forwards raw tool names.',
	);
	return 0;
};

process.exit(await main());
