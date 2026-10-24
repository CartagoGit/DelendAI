/**
 * no-locale-order-in-canonical.script.ts — the packages that hash and
 * project state sort with compareCodeUnits, never localeCompare.
 *
 * localeCompare depends on the machine's locale and ties distinct strings
 * (U+19D2 and U+0C7D compare 0), so a digest it orders can differ between
 * two runs over the same state: the 0.2.2 forward sync failed its required
 * check on exactly that.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

/** Source roots whose sorts feed canonical hashes, digests or projections. */
export const CANONICAL_ROOTS = [
	'packages/state/src',
	'packages/state-sqlite/src',
	'packages/state-telemetry/src',
	'packages/proposals-sqlite/src',
	'packages/context-compiler/src',
] as const;

const sources = (dir: string): string[] =>
	readdirSync(dir).flatMap((entry) => {
		const path = join(dir, entry);
		if (statSync(path).isDirectory()) return sources(path);
		return path.endsWith('.ts') && !path.endsWith('.spec.ts') ? [path] : [];
	});

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
	for (const scanRoot of CANONICAL_ROOTS) {
		for (const file of sources(join(root, scanRoot))) {
			scanned += 1;
			found.push(
				...localeOrderLines(
					relative(root, file),
					readFileSync(file, 'utf8'),
				),
			);
		}
	}
	if (scanned === 0) {
		console.error('✖ no-locale-order-in-canonical: scanned no file.');
		return 1;
	}
	if (found.length > 0) {
		console.error(
			`✖ no-locale-order-in-canonical: ${String(found.length)} localeCompare call(s) in canonical code; sort with compareCodeUnits from @delendai/state:`,
		);
		for (const line of found) console.error(`  ${line}`);
		return 1;
	}
	console.log(
		`✓ no-locale-order-in-canonical: ${String(scanned)} files order with code units.`,
	);
	return 0;
};

if (import.meta.main) process.exit(main());
