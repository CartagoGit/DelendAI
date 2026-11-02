#!/usr/bin/env bun
/**
 * `bun run lint:brand` / `bun run sync:logo` — `apps/shared/brand` is the
 * only authored copy of each logo; the web's and the extension's are
 * generated from it.
 *
 * Without `--write` it checks: every copy byte-identical to its source,
 * and the monochrome mark really monochrome (one colour, `currentColor`,
 * and not the colour mark under another name). With `--write` it
 * regenerates the copies first. Exits non-zero on any drift.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const BRAND = 'apps/shared/brand';

/** Each authored logo and the copies generated from it. */
const COPIES: Readonly<Record<string, readonly string[]>> = {
	'logo.svg': [
		'apps/web/public/logo.svg',
		'extensions/vscode/media/logo.svg',
	],
	'logo-mono.svg': [
		'apps/web/public/logo-mono.svg',
		'extensions/vscode/media/logo-mono.svg',
	],
};

const read = (path: string): Buffer => readFileSync(resolve(REPO_ROOT, path));

/** Why the monochrome mark is not one; nothing when it is. */
export const monochromeProblems = (
	mono: string,
	colour: string,
): readonly string[] => {
	const problems: string[] = [];
	if (mono === colour) problems.push('it is the colour mark, byte for byte');
	const paints = [
		...mono.matchAll(/\b(?:fill|stroke|stop-color)="([^"]+)"/gu),
	]
		.map((match) => match[1])
		.filter((paint) => paint !== 'none');
	const others = [
		...new Set(paints.filter((paint) => paint !== 'currentColor')),
	];
	if (others.length > 0)
		problems.push(
			`it paints with ${others.join(', ')}, not only currentColor`,
		);
	if (/<(?:linear|radial)Gradient\b/u.test(mono))
		problems.push('it defines a gradient');
	return problems;
};

const main = (): number => {
	const write = process.argv.includes('--write');
	const drift: string[] = [];
	for (const [name, targets] of Object.entries(COPIES)) {
		const source = read(`${BRAND}/${name}`);
		for (const target of targets) {
			if (write) writeFileSync(resolve(REPO_ROOT, target), source);
			else if (Buffer.compare(source, read(target)) !== 0)
				drift.push(`${target} differs from ${BRAND}/${name}`);
		}
	}
	for (const problem of monochromeProblems(
		read(`${BRAND}/logo-mono.svg`).toString('utf8'),
		read(`${BRAND}/logo.svg`).toString('utf8'),
	))
		drift.push(`${BRAND}/logo-mono.svg is not monochrome: ${problem}`);
	if (drift.length > 0) {
		for (const line of drift) console.error(`brand-drift: ${line}`);
		console.error(
			'Edit only apps/shared/brand, then run `bun run sync:logo`.',
		);
		return 1;
	}
	const count = Object.values(COPIES).flat().length;
	console.log(
		`brand-ok: ${count} cop${count === 1 ? 'y' : 'ies'} ${write ? 'written from' : 'match'} ${BRAND}`,
	);
	return 0;
};

if (import.meta.main) process.exit(main());
