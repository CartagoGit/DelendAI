import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { findBuildImportsFromSrc } from './no-build-imports-from-src.script';

const temporaryDirectories: string[] = [];

afterEach(async () => {
	await Promise.all(
		temporaryDirectories
			.splice(0)
			.map((directory) =>
				rm(directory, { recursive: true, force: true }),
			),
	);
});

const createFixture = async (source: string): Promise<string> => {
	const directory = await mkdtemp('/tmp/delendai-build-src-test-');
	temporaryDirectories.push(directory);
	await writeFile(join(directory, 'index.js'), source, 'utf8');
	return directory;
};

describe('no-build-imports-from-src', () => {
	it('allows imports that stay inside the build tree', async () => {
		const directory = await createFixture(
			"import { helper } from './lib/helper.js';\nexport { helper };\n",
		);

		expect(await findBuildImportsFromSrc(directory)).toEqual([]);
	});

	it('reports a relative import into src', async () => {
		const directory = await createFixture(
			"import { helper } from '../src/helper.js';\n",
		);

		const findings = await findBuildImportsFromSrc(directory);
		expect(findings).toHaveLength(1);
		expect(findings[0]?.specifier).toBe('../src/helper.js');
	});

	it('reports a deep relative import into another workspace src', async () => {
		const directory = await createFixture(
			"const helper = require('../../packages/core/src/helper.js');\n",
		);

		const findings = await findBuildImportsFromSrc(directory);
		expect(findings).toHaveLength(1);
		expect(findings[0]?.specifier).toBe(
			'../../packages/core/src/helper.js',
		);
	});

	it('allows package imports even when the package name contains src text', async () => {
		const directory = await createFixture(
			"import { tool } from '@delendai/core';\nexport { tool };\n",
		);

		expect(await findBuildImportsFromSrc(directory)).toEqual([]);
	});

	it('ignores source-looking imports embedded in a template literal', async () => {
		const directory = await createFixture(
			"const fixture = `import { helper } from '../src/helper.js'`;\n",
		);

		expect(await findBuildImportsFromSrc(directory)).toEqual([]);
	});
});
