import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
	findUndeclared,
	packageNameOf,
	stripTemplateLiterals,
} from './workspace-deps-declared.script';

describe('packageNameOf', () => {
	it('keeps the scope and package, dropping the subpath', () => {
		expect(packageNameOf('@delendai/quality/public')).toBe(
			'@delendai/quality',
		);
		expect(packageNameOf('@delendai/core')).toBe('@delendai/core');
	});
});

describe('stripTemplateLiterals', () => {
	it('blanks generated source so a scaffold is not read as an import', () => {
		// `scaffold-extension-host.ts` emits source inside template
		// literals. Scanning raw text reported packages/core as
		// importing ui-extension — text core writes for somebody else
		// to compile, and never resolves itself.
		const text =
			"const template = `import { X } from '@delendai/ui-extension/public';`;";
		expect(stripTemplateLiterals(text)).not.toContain('ui-extension');
	});

	it('leaves a real import alone', () => {
		const text = "import { X } from '@delendai/core/public';";
		expect(stripTemplateLiterals(text)).toContain('@delendai/core');
	});
});

describe('findUndeclared', () => {
	let root = '';
	const workspace = (
		rel: string,
		pkg: Record<string, unknown>,
		source: string,
	): void => {
		mkdirSync(join(root, rel, 'src'), { recursive: true });
		writeFileSync(
			join(root, rel, 'package.json'),
			`${JSON.stringify(pkg, null, '\t')}\n`,
		);
		writeFileSync(join(root, rel, 'src', 'index.ts'), source);
	};

	beforeEach(() => {
		root = mkdtempSync(join(tmpdir(), 'workspace-deps-'));
	});
	afterEach(() => {
		rmSync(root, { recursive: true, force: true });
	});

	it('flags an import of a sibling the package never declared', () => {
		// `beta` is created as a real workspace, because that is the rule:
		// an undeclared dependency on a package that EXISTS. A name that
		// resolves to no workspace at all is a broken import, a different
		// defect, and one this gate deliberately stays quiet about — its
		// own fixtures are full of such names and it used to report them.
		workspace(
			'plugins/beta',
			{ name: '@delendai/beta' },
			'export const x = 1;\n',
		);
		workspace(
			'plugins/alpha',
			{ name: '@delendai/alpha' },
			"import { x } from '@delendai/beta/public';\n",
		);
		const found = findUndeclared(root);
		expect(found).toHaveLength(1);
		expect(found[0]?.imported).toBe('@delendai/beta');
	});

	it('accepts it once declared, in any of the three sections', () => {
		workspace(
			'plugins/beta',
			{ name: '@delendai/beta' },
			'export const x = 1;\n',
		);
		workspace(
			'plugins/alpha',
			{
				name: '@delendai/alpha',
				devDependencies: { '@delendai/beta': 'workspace:*' },
			},
			"import { x } from '@delendai/beta/public';\n",
		);
		expect(findUndeclared(root)).toEqual([]);
	});

	it('does not flag a package importing its own public name', () => {
		workspace(
			'plugins/alpha',
			{ name: '@delendai/alpha' },
			"import { x } from '@delendai/alpha/public';\n",
		);
		expect(findUndeclared(root)).toEqual([]);
	});
});
