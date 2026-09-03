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
		expect(packageNameOf('@mcp-vertex/quality/public')).toBe(
			'@mcp-vertex/quality',
		);
		expect(packageNameOf('@mcp-vertex/core')).toBe('@mcp-vertex/core');
	});
});

describe('stripTemplateLiterals', () => {
	it('blanks generated source so a scaffold is not read as an import', () => {
		// `scaffold-extension-host.ts` emits source inside template
		// literals. Scanning raw text reported packages/core as
		// importing ui-extension — text core writes for somebody else
		// to compile, and never resolves itself.
		const text =
			"const template = `import { X } from '@mcp-vertex/ui-extension/public';`;";
		expect(stripTemplateLiterals(text)).not.toContain('ui-extension');
	});

	it('leaves a real import alone', () => {
		const text = "import { X } from '@mcp-vertex/core/public';";
		expect(stripTemplateLiterals(text)).toContain('@mcp-vertex/core');
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
		workspace(
			'plugins/alpha',
			{ name: '@mcp-vertex/alpha' },
			"import { x } from '@mcp-vertex/beta/public';\n",
		);
		const found = findUndeclared(root);
		expect(found).toHaveLength(1);
		expect(found[0]?.imported).toBe('@mcp-vertex/beta');
	});

	it('accepts it once declared, in any of the three sections', () => {
		workspace(
			'plugins/alpha',
			{
				name: '@mcp-vertex/alpha',
				devDependencies: { '@mcp-vertex/beta': 'workspace:*' },
			},
			"import { x } from '@mcp-vertex/beta/public';\n",
		);
		expect(findUndeclared(root)).toEqual([]);
	});

	it('does not flag a package importing its own public name', () => {
		workspace(
			'plugins/alpha',
			{ name: '@mcp-vertex/alpha' },
			"import { x } from '@mcp-vertex/alpha/public';\n",
		);
		expect(findUndeclared(root)).toEqual([]);
	});
});
