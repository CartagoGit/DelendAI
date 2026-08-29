#!/usr/bin/env bun
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { repoRoot } from '../lib/monorepo-paths';

const PUBLIC_BARREL_REL = 'packages/core/src/public/index.ts';

const parseStatements = (source: string): readonly string[] =>
	source
		.replace(/\n\s*/g, ' ')
		.split(';')
		.map((statement) => statement.trim())
		.filter((statement) => statement.length > 0);

const main = (): number => {
	const barrelPath = join(repoRoot(), PUBLIC_BARREL_REL);
	const source = readFileSync(barrelPath, 'utf8');
	const statements = parseStatements(source);
	const exportStatement = statements.find((statement) =>
		statement.includes('nodeDynamicImport'),
	);

	if (
		exportStatement?.includes("from '../lib/plugins/load-plugins'") === true
	) {
		process.stderr.write(
			`✖ no-deprecated-re-exports-from-public: ${PUBLIC_BARREL_REL} still re-exports nodeDynamicImport from ../lib/plugins/load-plugins. Route the public shim through ../node/dynamic-import instead.\n`,
		);
		return 1;
	}

	if (
		exportStatement?.includes(
			"export { nodeDynamicImport } from '../node/dynamic-import'",
		) === true &&
		!exportStatement.includes('@deprecated')
	) {
		process.stderr.write(
			`✖ no-deprecated-re-exports-from-public: ${PUBLIC_BARREL_REL} exports nodeDynamicImport, but the export is missing an @deprecated JSDoc shim that points callers at @mcp-vertex/core/node.\n`,
		);
		return 1;
	}

	process.stdout.write(
		'✓ no-deprecated-re-exports-from-public: public barrel does not expose a non-deprecated nodeDynamicImport path.\n',
	);
	return 0;
};

if (import.meta.main) {
	process.exit(main());
}
