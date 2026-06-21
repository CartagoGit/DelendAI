import { mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
	detectInternalCoreImports,
	formatReport,
	scanText,
} from './no-internal-core-imports.script';

describe('no-internal-core-imports.script', () => {
	it('allows the public core entrypoint', () => {
		const findings = scanText(
			'import { runCli } from "@mcp-vertex/core/public";\n',
			'/repo/packages/cli/src/index.ts',
			'packages/cli/src/index.ts',
		);
		expect(findings).toHaveLength(0);
	});

	it('flags package imports from core lib internals', () => {
		const findings = scanText(
			'import { x } from "@mcp-vertex/core/lib/plugins";\n',
			'/repo/packages/cli/src/index.ts',
			'packages/cli/src/index.ts',
		);
		expect(findings[0]?.specifier).toBe('@mcp-vertex/core/lib/plugins');
		expect(findings[0]?.reason).toContain('@mcp-vertex/core/public');
	});

	it('flags package imports from core dist output', () => {
		const findings = scanText(
			'export { x } from "@mcp-vertex/core/dist/public";\n',
			'/repo/packages/cli/src/index.ts',
			'packages/cli/src/index.ts',
		);
		expect(findings[0]?.specifier).toBe('@mcp-vertex/core/dist/public');
	});

	it('flags relative imports into packages/core/src/lib', () => {
		const findings = scanText(
			'import { x } from "../../../packages/core/src/lib/bootstrap";\n',
			'/repo/packages/cli/src/index.ts',
			'packages/cli/src/index.ts',
		);
		expect(findings[0]?.specifier).toContain('packages/core/src/lib');
	});

	it('flags relative imports through ../../core/src/lib', () => {
		const findings = scanText(
			'import { x } from "../../core/src/lib/bootstrap";\n',
			'/repo/packages/cli/src/index.ts',
			'packages/cli/src/index.ts',
		);
		expect(findings[0]?.specifier).toBe('../../core/src/lib/bootstrap');
	});

	it('detects violations under a temporary CLI source tree', async () => {
		const root = await makeTmpTree({
			'index.ts': 'import { x } from "@mcp-vertex/core/lib/bootstrap";\n',
			'nested/ok.ts':
				'import { runCli } from "@mcp-vertex/core/public";\n',
		});
		const findings = await detectInternalCoreImports(root);
		expect(findings).toHaveLength(1);
		expect(findings[0]?.specifier).toBe('@mcp-vertex/core/lib/bootstrap');
		await rm(root, { recursive: true });
	});

	it('formatReport prints actionable rows', () => {
		const out = formatReport([
			{
				absPath: '/repo/packages/cli/src/index.ts',
				relPath: 'packages/cli/src/index.ts',
				line: 3,
				specifier: '@mcp-vertex/core/lib/bootstrap',
				reason: 'use @mcp-vertex/core/public',
			},
		]);
		expect(out).toContain('1 violation');
		expect(out).toContain('packages/cli/src/index.ts:3');
		expect(out).toContain('@mcp-vertex/core/public');
	});
});

const makeTmpTree = async (
	files: Readonly<Record<string, string>>,
): Promise<string> => {
	const root = join(
		tmpdir(),
		`no-internal-core-imports-${Date.now()}-${Math.random().toString(36).slice(2)}`,
	);
	await mkdir(root, { recursive: true });
	for (const [rel, content] of Object.entries(files)) {
		const abs = join(root, rel);
		await mkdir(join(abs, '..'), { recursive: true });
		await writeFile(abs, content, 'utf8');
	}
	return root;
};
