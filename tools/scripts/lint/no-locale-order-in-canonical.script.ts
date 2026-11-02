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
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

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

/**
 * The tracked sources under the roots, from git: a walk of the tree read
 * the files a proof's specs create and delete beside it, and failed on
 * one that vanished between listing and reading.
 */
const sources = (root: string): readonly string[] =>
	execFileSync('git', ['ls-files', '-z', '--', ...SOURCE_ROOTS], {
		cwd: root,
		encoding: 'utf8',
		maxBuffer: 64 * 1024 * 1024,
	})
		.split('\0')
		.filter((file) => file.endsWith('.ts') && !file.endsWith('.spec.ts'));

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
	for (const rel of sources(root)) {
		const text = readFileSync(join(root, rel), 'utf8');
		if (!isCanonicalProducer(rel, text)) continue;
		scanned += 1;
		found.push(...localeOrderLines(rel, text));
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
