#!/usr/bin/env bun
/**
 * `bun run sync:logo` — keeps `extensions/vscode/media/logo.svg` byte-
 * identical with `apps/web/public/logo.svg`. Run from the workspace
 * root. Exits non-zero if drift is detected so `bun run lint:brand`
 * (which calls this script) fails loudly on a stale asset.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const source = resolve(import.meta.dir, '../../../apps/web/public/logo.svg');
const target = resolve(import.meta.dir, '../media/logo.svg');

const srcBytes = readFileSync(source);
const tgtBytes = readFileSync(target);

if (Buffer.compare(srcBytes, tgtBytes) !== 0) {
	console.error(
		`brand-drift: ${target} differs from ${source}. Run \`bun run sync:logo\`.`,
	);
	process.exit(1);
}

console.log(
	'brand-ok: extensions/vscode/media/logo.svg is byte-identical to apps/web/public/logo.svg',
);
