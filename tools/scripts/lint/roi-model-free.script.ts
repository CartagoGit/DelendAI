#!/usr/bin/env bun
/**
 * roi-model-free.script.ts — the token-ROI path stays model-free.
 *
 * `packages/core/src/lib/budgets/` and `packages/core/src/lib/metrics/`
 * compute every number the ROI report rests on from bytes and call counts.
 * A model id, a price or a currency there would make the report mean one
 * thing for one maker and nothing for the next; the price layer lives in
 * `usage-tracking`, outside the core, and stays there.
 *
 * The model vocabulary is the shipped public catalogue snapshot — every
 * model id it lists, and every model family followed by a version — so a
 * maker listed tomorrow is caught without editing this file.
 */
import { readdir, readFile } from 'node:fs/promises';
import { join, relative, resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '../../..');

const SCANNED = [
	'packages/core/src/lib/budgets',
	'packages/core/src/lib/metrics',
];

const SNAPSHOT = 'packages/core/data/model-catalogue.snapshot.json';

/** Family words too common in code to stand for a model on their own. */
const TOO_COMMON = new Set(['text', 'code', 'chat', 'model', 'open', 'base']);
const MIN_FAMILY = 3;
/** Shorter ids (`s1`) read as anything: a slice, a step, a section. */
const MIN_ID = 4;

const PRICE_PATTERNS: readonly RegExp[] = [
	/[$€£¥]\s?\d/u,
	/\b(usd|eur|gbp|price|prices|pricing|costusd)\b/iu,
];

interface ISnapshot {
	readonly data?: {
		readonly providers?: readonly { readonly models?: readonly string[] }[];
	};
}

const escapeRegExp = (word: string): string =>
	word.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');

/** The model ids and versioned families the snapshot names. */
export const modelPatterns = (snapshot: ISnapshot): readonly RegExp[] => {
	const ids = new Set<string>();
	const families = new Set<string>();
	for (const provider of snapshot.data?.providers ?? [])
		for (const model of provider.models ?? []) {
			const id = (model.split('/').pop() ?? model).toLowerCase();
			if (/\d/u.test(id) && id.length >= MIN_ID) ids.add(id);
			const family = /^[a-z]+/u.exec(id)?.[0];
			if (
				family !== undefined &&
				family.length >= MIN_FAMILY &&
				!TOO_COMMON.has(family)
			)
				families.add(family);
		}
	if (ids.size === 0) return [];
	return [
		new RegExp(
			`(^|[^a-z0-9])(${[...ids].map(escapeRegExp).join('|')})([^a-z0-9]|$)`,
			'iu',
		),
		new RegExp(
			`(^|[^a-z0-9])(${[...families].map(escapeRegExp).join('|')})-?\\d`,
			'iu',
		),
	];
};

/** Each line of `files` that names a model, a price or a currency. */
export const modelFreeViolations = (
	files: readonly { readonly path: string; readonly text: string }[],
	models: readonly RegExp[],
): readonly string[] =>
	files.flatMap(({ path, text }) =>
		text.split('\n').flatMap((line, index) => {
			const found = [...models, ...PRICE_PATTERNS].find((pattern) =>
				pattern.test(line),
			);
			return found === undefined
				? []
				: [`${path}:${index + 1}: ${line.trim()}`];
		}),
	);

const sourcesUnder = async (dir: string): Promise<readonly string[]> => {
	const entries = await readdir(join(ROOT, dir), {
		recursive: true,
		withFileTypes: true,
	});
	return entries
		.filter((entry) => entry.isFile() && entry.name.endsWith('.ts'))
		.map((entry) => relative(ROOT, join(entry.parentPath, entry.name)));
};

const main = async (): Promise<number> => {
	const snapshot = JSON.parse(
		await readFile(join(ROOT, SNAPSHOT), 'utf8'),
	) as ISnapshot;
	const models = modelPatterns(snapshot);
	if (models.length === 0) {
		console.error(
			`✖ roi-model-free: ${SNAPSHOT} lists no model; nothing to check against.`,
		);
		return 1;
	}
	const paths = (await Promise.all(SCANNED.map(sourcesUnder))).flat();
	if (paths.length === 0) {
		console.error(
			`✖ roi-model-free: no source under ${SCANNED.join(', ')}; the scan measured nothing.`,
		);
		return 1;
	}
	const files = await Promise.all(
		paths.map(async (path) => ({
			path,
			text: await readFile(join(ROOT, path), 'utf8'),
		})),
	);
	const violations = modelFreeViolations(files, models);
	if (violations.length > 0) {
		console.error(
			`✖ roi-model-free: the ROI path names a model, a price or a currency:\n  ${violations.join('\n  ')}`,
		);
		return 1;
	}
	console.log(
		`✓ roi-model-free: ${files.length} files under ${SCANNED.join(', ')} name no model, price or currency.`,
	);
	return 0;
};

if (import.meta.main) process.exit(await main());
