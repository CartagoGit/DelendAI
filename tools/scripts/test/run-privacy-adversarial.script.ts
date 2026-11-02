#!/usr/bin/env bun
import { spawnSync } from 'node:child_process';

const result = spawnSync(
	'bunx',
	[
		'vitest',
		'run',
		'plugins/error-reporting/tests/privacy-adversarial.spec.ts',
		'plugins/error-reporting/tests/report-builder.spec.ts',
		'packages/core/tests/src/lib/contracts/resolvers/safe-tool-identity.resolver.spec.ts',
		'packages/core/tests/src/lib/contracts/resolvers/safe-tool-identity.property.spec.ts',
	],
	{
		stdio: 'inherit',
		cwd: process.cwd(),
	},
);

if (result.error) {
	console.error(
		`run-privacy-adversarial: failed to spawn vitest: ${result.error.message}`,
	);
	process.exit(1);
}

process.exit(result.status ?? 1);
