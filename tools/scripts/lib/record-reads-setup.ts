/**
 * record-reads-setup.ts — vitest setup file.
 *
 * Records which repository files OUTSIDE every workspace a test run reads
 * (docs, root tests, root config), so the CI zone planner can know which
 * zones a change to such a file can break instead of running all of them.
 * The module graph already answers this question for code inside the
 * workspaces; it cannot see a spec that READS a file rather than
 * importing it.
 *
 * Inert unless `DELENDAI_RECORD_READS` names a directory: then each worker
 * appends the paths it read to its own file there. Nothing about a normal
 * run changes.
 */
import fs from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';
import { join, relative, resolve } from 'node:path';

const OUT_DIR = process.env.DELENDAI_RECORD_READS;
const ROOT = resolve(import.meta.dirname, '..', '..', '..');
const WORKSPACE_PREFIXES = [
	'packages/',
	'plugins/',
	'apps/',
	'extensions/',
	'tools/',
];
const IGNORED_PREFIXES = [
	'node_modules/',
	'.cache/',
	'.git/',
	'.vitest-reports/',
	'coverage/',
];

const seen = new Set<string>();
let sink: ((line: string) => void) | undefined;
const note = (target: unknown): void => {
	if (typeof target !== 'string' && !(target instanceof URL)) return;
	const abs = resolve(
		String(target instanceof URL ? target.pathname : target),
	);
	const rel = relative(ROOT, abs);
	if (rel === '' || rel.startsWith('..')) return;
	if (WORKSPACE_PREFIXES.some((p) => rel.startsWith(p))) return;
	if (IGNORED_PREFIXES.some((p) => rel.startsWith(p))) return;
	const path = rel.split('\\').join('/');
	if (seen.has(path)) return;
	seen.add(path);
	sink?.(path);
};

if (OUT_DIR !== undefined && OUT_DIR.length > 0) {
	type Fn = (...args: unknown[]) => unknown;
	const wrap =
		(original: Fn): Fn =>
		(...args) => {
			note(args[0]);
			return original(...args);
		};
	const instrument = (target: object, names: readonly string[]): void => {
		for (const name of names) {
			const original: unknown = Reflect.get(target, name);
			if (typeof original === 'function') {
				Reflect.set(target, name, wrap(original.bind(target) as Fn));
			}
		}
	};
	instrument(fs, [
		'readFileSync',
		'readdirSync',
		'existsSync',
		'statSync',
		'openSync',
	]);
	instrument(fs.promises, ['readFile', 'readdir', 'stat', 'access', 'open']);
	syncBuiltinESMExports();
	// Appended as each new path is seen: vitest ends its workers without
	// `beforeExit`, so anything buffered until then is lost.
	const original = {
		mkdirSync: fs.mkdirSync.bind(fs),
		appendFileSync: fs.appendFileSync.bind(fs),
	};
	original.mkdirSync(OUT_DIR, { recursive: true });
	const file = join(
		OUT_DIR,
		`reads-${process.pid}-${Math.random().toString(36).slice(2)}.txt`,
	);
	sink = (line) => {
		try {
			original.appendFileSync(file, `${line}\n`);
		} catch {
			// best effort: a lost line only makes the map more conservative
		}
	};
}
