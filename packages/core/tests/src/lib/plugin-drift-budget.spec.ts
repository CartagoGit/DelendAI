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
/**
 * Sync `node:fs` calls that are permitted in plugin source, keyed by the
 * CALL rather than by its coordinates.
 *
 * It used to be a list of `path:line`. Line numbers drift, and these had:
 * resolving the eighteen committed entries against the current tree landed
 * on `},`, on `'quality',`, on four comment lines and on an import of
 * `node:fs/promises` — which is asynchronous, and therefore the opposite of
 * what the entry was granting. Twelve of the eighteen guarded nothing at
 * all, because `proposals` and `project-kpis` no longer do sync I/O; the
 * gate had been passing on stale coordinates while quietly permitting
 * whatever happened to sit at them.
 *
 * Keying by the source line keeps the allowlist true across unrelated
 * edits, and the multiplicity is what preserves precision: a file that
 * grows a SECOND identical call has one more occurrence than entries here
 * allow, and fails. Adding a call still requires a deliberate entry.
 */
const SYNC_IO_ALLOWLIST: readonly string[] = [
	// The import statement itself. The usages below are what matter; an
	// unused sync import would already fail typecheck and lint.
	"plugins/commit-policy/src/lib/services/repair-proposer.ts::import { mkdirSync, writeFileSync } from 'node:fs';",
	// commit-policy's storm log is read during `register()`, which the
	// plugin contract declares synchronous, and the host boot step that
	// files repair proposals runs AFTER registration and reads the detector
	// this seeding fills. Making the read async would let boot observe an
	// empty detector and re-file storms that were already recorded, so the
	// ordering guarantee is the constraint, not convenience.
	//
	// Two occurrences: `readAll` and `readOne`. The `existsSync` guards
	// they used to carry are gone — the surrounding `catch` already
	// answered "missing path", and in a swarm the check-then-act pair was a
	// race as well as a wasted syscall.
	"plugins/commit-policy/src/lib/services/storm-log.ts::const raw = readFileSync(path, 'utf8');",
	"plugins/commit-policy/src/lib/services/storm-log.ts::const raw = readFileSync(path, 'utf8');",
];

/** Occurrence budget per `path::code` key, built from the list above. */
const syncIoBudget = (): Map<string, number> => {
	const budget = new Map<string, number>();
	for (const key of SYNC_IO_ALLOWLIST)
		budget.set(key, (budget.get(key) ?? 0) + 1);
	return budget;
};

const SYNC_IO_PATTERN =
	/\b(existsSync|readFileSync|readdirSync|mkdirSync|writeFileSync)\b/;

describe('plugin satellite drift budget (l00008 s7)', async () => {
	it('0 sync node:fs calls in plugins/*/src outside the documented allowlist', async () => {
		const files = await collectPluginSourceFiles();
		const budget = syncIoBudget();
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
				const key = `${relPath(abs)}::${trimmed}`;
				const remaining = budget.get(key) ?? 0;
				if (remaining > 0) {
					budget.set(key, remaining - 1);
					continue;
				}
				violations.push(`${relPath(abs)}:${i + 1}: ${trimmed}`);
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
