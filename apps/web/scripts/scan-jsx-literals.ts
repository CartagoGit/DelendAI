/**
 * scan-jsx-literals.ts
 *
 * Checks that localized Astro pages do not contain hardcoded English strings
 * in their layout title and page header attributes. They must use the type-safe
 * `t` translations object instead.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const PAGES_DIR = join(__dirname, '../src/pages/[lang]');

const PAGE_HEADER_RE = /<PageHeader[^>]*\btitle=["']([^"']+)["']/i;
const BASE_RE = /<Base[^>]*\btitle=["']([^"']+)["']/i;

const walk = (dir: string): string[] => {
	let results: string[] = [];
	const list = readdirSync(dir);
	for (const file of list) {
		const fullPath = join(dir, file);
		const stat = statSync(fullPath);
		if (stat && stat.isDirectory()) {
			results = results.concat(walk(fullPath));
		} else if (file.endsWith('.astro')) {
			results.push(fullPath);
		}
	}
	return results;
};

const run = () => {
	let hasError = false;
	const files = walk(PAGES_DIR);

	for (const file of files) {
		const content = readFileSync(file, 'utf8');
		const relPath = file.substring(file.indexOf('apps/web/'));

		const headerMatch = content.match(PAGE_HEADER_RE);
		if (headerMatch) {
			console.error(
				`✗ ${relPath}: found hardcoded title in <PageHeader>: "${headerMatch[1]}"`,
			);
			hasError = true;
		}

		const baseMatch = content.match(BASE_RE);
		if (baseMatch) {
			console.error(
				`✗ ${relPath}: found hardcoded title in <Base>: "${baseMatch[1]}"`,
			);
			hasError = true;
		}
	}

	if (hasError) {
		console.error(
			'\n✗ scan-jsx-literals failed: Hardcoded English literals found in localized pages.',
		);
		process.exit(1);
	}

	console.log(
		'✓ scan-jsx-literals passed: No hardcoded English literals in localized pages.',
	);
};

run();
