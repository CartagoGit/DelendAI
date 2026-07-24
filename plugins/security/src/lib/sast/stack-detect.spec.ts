import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { detectStack } from './stack-detect';

const workspace = async (
	files: Readonly<Record<string, string>>,
): Promise<string> => {
	const dir = await mkdtemp(join(tmpdir(), 'mcpv-stack-'));
	await Promise.all(
		Object.entries(files).map(async ([path, content]) => {
			const absolute = join(dir, path);
			await mkdir(join(absolute, '..'), { recursive: true }).catch(
				() => {},
			);
			await writeFile(absolute, content, 'utf8');
		}),
	);
	return dir;
};

describe('detectStack', () => {
	it('detects a TypeScript stack from manifest + ts files', async () => {
		const dir = await workspace({
			'package.json': JSON.stringify({
				dependencies: { typescript: '^5.0.0' },
			}),
			'src/index.ts': 'export const x = 1;',
		});
		const stack = await detectStack(dir);
		expect(stack.pack).toBe('typescript');
		expect(stack.languages).toContain('typescript');
	});

	it('detects a Python stack from file presence', async () => {
		const dir = await workspace({
			'pyproject.toml': '[project]\nname = "sample"',
			'app.py': 'import yaml\nyaml.load(data)',
		});
		const stack = await detectStack(dir);
		expect(stack.pack).toBe('python');
		expect(stack.languages).toContain('python');
	});

	it('detects mixed projects across multiple languages', async () => {
		const dir = await workspace({
			'src/index.ts': 'export const x = 1;',
			'app.py': 'print("x")',
		});
		const stack = await detectStack(dir);
		expect(stack.pack).toBe('mixed');
		expect(stack.languages).toContain('typescript');
		expect(stack.languages).toContain('python');
	});
});
