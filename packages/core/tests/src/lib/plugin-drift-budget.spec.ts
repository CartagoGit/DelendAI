/**
 * plugin-drift-budget.spec.ts — l00008 s7.
 *
 * A non-regression budget against 3 anti-patterns the l00008 consolidation
 * closed across the plugin satellite: sync `node:fs` calls in plugin
 * source outside an explicit boot-time allowlist, residual
 * `z.object({}).catchall(z.unknown())` outputSchemas, and raw
 * `await writeFile(` bypassing the `writeFileAtomic` primitive. Each
 * check greps `plugins/*\/src/**\/*.ts` (excluding specs) directly
 * against the repo tree — no fixtures, so a regression introduced by a
 * future PR is caught the moment it lands, not just at audit time.
 */
import { readFile, readdir } from 'node:fs/promises';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const REPO_ROOT = resolve(
	dirname(fileURLToPath(import.meta.url)),
	'../../../../..',
);
const PLUGINS_DIR = join(REPO_ROOT, 'plugins');

/** Recursively collect every non-spec `.ts` file under `plugins/<name>/src`. */
const collectPluginSourceFiles = async (): Promise<string[]> => {
	const out: string[] = [];
	const pluginNames = await readdir(PLUGINS_DIR, { withFileTypes: true });
	for (const entry of pluginNames) {
		if (!entry.isDirectory()) continue;
		const srcDir = join(PLUGINS_DIR, entry.name, 'src');
		await walk(srcDir, out);
	}
	return out;
};

const walk = async (dir: string, out: string[]): Promise<void> => {
	let entries: Array<{
		name: string;
		isDirectory(): boolean;
		isFile(): boolean;
	}>;
	try {
		entries = await readdir(dir, { withFileTypes: true });
	} catch {
		return; // plugin without a src/ dir (shouldn't happen, but never throw)
	}
	for (const entry of entries) {
		const abs = join(dir, entry.name);
		if (entry.isDirectory()) {
			await walk(abs, out);
		} else if (
			entry.isFile() &&
			abs.endsWith('.ts') &&
			!abs.endsWith('.spec.ts') &&
			!abs.endsWith('.test.ts')
		) {
			out.push(abs);
		}
	}
};

const relPath = (abs: string): string =>
	relative(REPO_ROOT, abs).split('\\').join('/');

// Each entry: `<relative-file-path>:<line-number>` — the exact, narrow
// boot-time one-shots this consolidation (and its predecessors, f00020/f00019)
// left in place, each with a code comment at the call site explaining why.
const SYNC_IO_ALLOWLIST = new Set<string>([
	// The import statement itself — the actual usages below are what
	// matter; an unused sync import would already fail typecheck/lint.
	'plugins/proposals/src/lib/agents/loop-detector-service.ts:1',
	// Constructor one-shot: instantiated once per `register(ctx)`, not
	// per-request (l00008 s1).
	'plugins/proposals/src/lib/agents/loop-detector-service.ts:96',
	'plugins/proposals/src/lib/agents/loop-detector-service.ts:99',
	// isAgentStuck: contract-constrained — packages/core's
	// IMcpVertexHostConfig.isAgentStuck is declared synchronous and is
	// invoked without `await` after every tool call; widening that core
	// contract is out of scope for this budget (l00008 s1, documented
	// in-code with a JSDoc on the method).
	'plugins/proposals/src/lib/agents/loop-detector-service.ts:423',
	'plugins/proposals/src/lib/agents/loop-detector-service.ts:424',
]);

const SYNC_IO_PATTERN =
	/\b(existsSync|readFileSync|readdirSync|mkdirSync|writeFileSync)\b/;

describe('plugin satellite drift budget (l00008 s7)', () => {
	it('0 sync node:fs calls in plugins/*/src outside the documented allowlist', async () => {
		const files = await collectPluginSourceFiles();
		const violations: string[] = [];
		for (const abs of files) {
			const content = await readFile(abs, 'utf8');
			const lines = content.split('\n');
			for (let i = 0; i < lines.length; i += 1) {
				const line = lines[i] ?? '';
				if (!SYNC_IO_PATTERN.test(line)) continue;
				// Skip comments/docstrings/markdown-bullets/template-strings
				// that merely mention the pattern. A line is "code" only if
				// it contains at least one token typical of an executable
				// statement; otherwise it is documentation and the mention
				// is descriptive, not a call.
				const trimmed = line.trim();
				if (
					trimmed.startsWith('//') ||
					trimmed.startsWith('*') ||
					trimmed.startsWith('- ')
				)
					continue;
				if (trimmed.startsWith('- ')) continue; // markdown bullet
				if (
					!/\b(from|require|await|return|throw|const|let|var|function|class|interface|type|export|import|if|for|while|switch|do|new)\b/.test(
						trimmed,
					)
				)
					continue;
				const key = `${relPath(abs)}:${i + 1}`;
				if (SYNC_IO_ALLOWLIST.has(key)) continue;
				violations.push(`${key}: ${trimmed}`);
			}
		}
		expect(violations, 'sync node:fs calls outside the allowlist').toEqual(
			[],
		);
	});

	it('0 residual z.object({}).catchall(z.unknown()) outputSchemas in plugins/*/src or packages/core/src', async () => {
		const pluginFiles = await collectPluginSourceFiles();
		const coreFiles: string[] = [];
		await walk(join(REPO_ROOT, 'packages', 'core', 'src'), coreFiles);
		const violations: string[] = [];
		for (const abs of [...pluginFiles, ...coreFiles]) {
			const content = await readFile(abs, 'utf8');
			const lines = content.split('\n');
			for (let i = 0; i < lines.length; i += 1) {
				const line = lines[i] ?? '';
				const trimmed = line.trim();
				if (trimmed.startsWith('//') || trimmed.startsWith('*'))
					continue;
				if (!/catchall\(z\.unknown/.test(line)) continue;
				violations.push(`${relPath(abs)}:${i + 1}: ${trimmed}`);
			}
		}
		expect(violations, 'residual catchall outputSchemas').toEqual([]);
	});

	it('0 raw `await writeFile(` in plugins/*/src (must be writeFileAtomic)', async () => {
		const files = await collectPluginSourceFiles();
		const violations: string[] = [];
		for (const abs of files) {
			const content = await readFile(abs, 'utf8');
			const lines = content.split('\n');
			for (let i = 0; i < lines.length; i += 1) {
				const line = lines[i] ?? '';
				const trimmed = line.trim();
				if (trimmed.startsWith('//') || trimmed.startsWith('*'))
					continue;
				if (!/await writeFile\(/.test(line)) continue;
				violations.push(`${relPath(abs)}:${i + 1}: ${trimmed}`);
			}
		}
		expect(violations, 'raw writeFile bypassing writeFileAtomic').toEqual(
			[],
		);
	});
});
