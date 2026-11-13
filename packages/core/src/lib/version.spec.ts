import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { DEFAULT_CLI_ARGS } from './plugins/parse-cli-args';
import { DELENDAI_VERSION } from './version';

const root = join(import.meta.dirname, '../../../..');
const read = (path: string): string => readFileSync(join(root, path), 'utf8');
const versionOf = (path: string): string =>
	(JSON.parse(read(path)) as { readonly version: string }).version;

describe('product versions', () => {
	it('the server reports the version core publishes', () => {
		expect(DELENDAI_VERSION).toBe(versionOf('packages/core/package.json'));
		expect(DEFAULT_CLI_ARGS.serverVersion).toBe(DELENDAI_VERSION);
	});

	it('no file that states a product version holds a literal one', () => {
		for (const file of [
			'packages/cli/src/contracts/constants/version.constant.ts',
			'packages/core/src/lib/version.ts',
			'packages/core/src/lib/plugins/parse-cli-args.ts',
			'packages/core/src/lib/scaffold/standalone-core-tools.ts',
		]) {
			expect(read(file), file).not.toMatch(/['"]\d+\.\d+\.\d+['"]/u);
		}
	});
});
