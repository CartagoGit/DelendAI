/**
 * no-locale-order-in-canonical.script.ts — code that hashes, digests or
 * writes canonical data sorts with compareCodeUnits, never localeCompare.
 *
 * localeCompare depends on the machine's locale and ties distinct strings
 * (U+19D2 and U+0C7D compare 0), so a digest it orders can differ between
 * two runs over the same state: the 0.2.2 forward sync failed its required
 * check on exactly that.
 *
 * Canonical code is the state packages as a whole, and anywhere else a
 * file that hashes or writes what it serialised: five fixed roots missed
 * the search plugin's embed index, sorted by hash and written as JSON.
 * Display order for people stays locale order; it neither hashes nor
 * writes a serialised file.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

/** Source roots whose sorts all feed canonical hashes, digests or projections. */
export const CANONICAL_ROOTS = [
	'packages/state/src',
	'packages/state-sqlite/src',
	'packages/state-telemetry/src',
	'packages/proposals-sqlite/src',
	'packages/context-compiler/src',
] as const;

/** Every root code is written under. */
const SOURCE_ROOTS = ['packages', 'plugins', 'tools', 'apps', 'extensions'];

/** Directories that hold no source of ours. */
const SKIPPED = new Set([
	'node_modules',
	'dist',
	'build',
	'coverage',
	'.cache',
]);

const sources = (dir: string): string[] =>
	readdirSync(dir).flatMap((entry) => {
		if (SKIPPED.has(entry)) return [];
		const path = join(dir, entry);
		if (statSync(path).isDirectory()) return sources(path);
		return path.endsWith('.ts') && !path.endsWith('.spec.ts') ? [path] : [];
	});

const HASHES = /\bcreateHash\(|\.digest\(/u;
const SERIALISES = /\bJSON\.stringify\(/u;
const WRITES = /\bwriteFile(?:Sync|Atomic)?\(/u;

/** Whether a file's order reaches a hash, a digest or a file it writes. */
export const isCanonicalProducer = (file: string, text: string): boolean =>
	CANONICAL_ROOTS.some((root) => file.startsWith(`${root}/`)) ||
	/stable-json/u.test(file) ||
	HASHES.test(text) ||
	(SERIALISES.test(text) && WRITES.test(text));

/** `file:line` for every localeCompare call in `text`. */
export const localeOrderLines = (file: string, text: string): string[] =>
	text
		.split('\n')
		.flatMap((line, index) =>
			/\.localeCompare\(/u.test(line) && !/^\s*(\/\/|\*)/u.test(line)
				? [`${file}:${String(index + 1)}`]
				: [],
		);

const main = (): number => {
	const root = process.cwd();
	let scanned = 0;
	const found: string[] = [];
	for (const scanRoot of SOURCE_ROOTS) {
		for (const file of sources(join(root, scanRoot))) {
			const rel = relative(root, file);
			const text = readFileSync(file, 'utf8');
			if (!isCanonicalProducer(rel, text)) continue;
			scanned += 1;
			found.push(...localeOrderLines(rel, text));
		}
	}
	if (scanned === 0) {
		console.error('✖ no-locale-order-in-canonical: scanned no file.');
		return 1;
	}
	if (found.length > 0) {
		console.error(
			`✖ no-locale-order-in-canonical: ${String(found.length)} localeCompare call(s) in canonical code; sort with compareCodeUnits:`,
		);
		for (const line of found) console.error(`  ${line}`);
		return 1;
	}
	console.log(
		`✓ no-locale-order-in-canonical: ${String(scanned)} canonical files order with code units.`,
	);
	return 0;
};

if (import.meta.main) process.exit(main());
