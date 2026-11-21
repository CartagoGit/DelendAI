import { describe, expect, it } from 'vitest';

import {
	affectedSpecs,
	runsCodeWhenLoaded,
	topLevelStatements,
} from './affected-specs.service';

/** A small repository: a barrel over two modules, and the specs of each. */
const REPO: Readonly<Record<string, string>> = {
	'pkg/src/a.ts': 'export const a = (): number => 1;\n',
	'pkg/src/b.ts':
		"import { a } from './a';\nexport const b = (): number => a() + 1;\n",
	'pkg/src/c.ts':
		'export interface IC { readonly c: string }\nexport const c = 3;\n',
	'pkg/src/loud.ts': "export const loud = 4;\nregister('loud');\n",
	'pkg/src/index.ts':
		"export { a } from './a';\nexport * from './b';\nexport { c as see } from './c';\nexport * from './loud';\n",
	'pkg/tests/a.spec.ts': "import { a } from '@pkg';\n",
	'pkg/tests/b.spec.ts': "import { b } from '@pkg';\n",
	'pkg/tests/c.spec.ts': "import { see } from '@pkg';\n",
	'pkg/tests/all.spec.ts': "import * as pkg from '@pkg';\n",
	'pkg/tests/mocked.spec.ts': "vi.mock('../src/c');\n",
	'pkg/tests/dynamic.spec.ts': "await import('../src/a');\n",
};

const affected = (changed: readonly string[]): readonly string[] =>
	affectedSpecs({
		files: Object.keys(REPO),
		changed,
		read: (file) => REPO[file] ?? '',
		paths: { '@pkg': ['./pkg/src/index.ts'] },
	});

describe('affectedSpecs', () => {
	it('follows a name through the barrel to the module that declares it', () => {
		expect(affected(['pkg/src/c.ts'])).toEqual([
			'pkg/tests/all.spec.ts',
			'pkg/tests/c.spec.ts',
			'pkg/tests/mocked.spec.ts',
		]);
	});

	it('reaches the users of a module through the modules that use it', () => {
		expect(affected(['pkg/src/a.ts'])).toEqual([
			'pkg/tests/a.spec.ts',
			'pkg/tests/all.spec.ts',
			'pkg/tests/b.spec.ts',
			'pkg/tests/dynamic.spec.ts',
		]);
	});

	it('follows a module that runs code when it loads by module, not by name', () => {
		expect(affected(['pkg/src/loud.ts'])).toEqual([
			'pkg/tests/a.spec.ts',
			'pkg/tests/all.spec.ts',
			'pkg/tests/b.spec.ts',
			'pkg/tests/c.spec.ts',
		]);
	});

	it('runs a changed spec and nothing for a file no code imports', () => {
		expect(affected(['pkg/tests/b.spec.ts'])).toEqual([
			'pkg/tests/b.spec.ts',
		]);
		expect(affected(['README.md'])).toEqual([]);
	});
});

describe('runsCodeWhenLoaded', () => {
	it('tells declarations from code that runs', () => {
		expect(runsCodeWhenLoaded("export const x = /a(b/u.test('a');\n")).toBe(
			false,
		);
		expect(
			runsCodeWhenLoaded(
				'const message = `line\n${1 + 1}\nend`;\nexport { message };\n',
			),
		).toBe(false);
		expect(
			runsCodeWhenLoaded('if (process.env.X) process.exit(1);\n'),
		).toBe(true);
		expect(
			runsCodeWhenLoaded("process.on('exit', () => undefined);\n"),
		).toBe(true);
	});

	it('reads one statement per top-level start', () => {
		expect(
			topLevelStatements('const a = 1;\nfoo({\n  b: 2,\n});\n'),
		).toEqual([
			'const a = 1;\nfoo({\n  b: 2,\n});\n',
			'foo({\n  b: 2,\n});\n',
		]);
	});
});
