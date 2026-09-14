#!/usr/bin/env bun

/**
 * core-public-consumers — a public export has to be called by somebody,
 * or say who it is for (x00541 S2).
 *
 * WHY a second gate next to the count. `lint:core-public-surface-budget`
 * asks how MANY symbols the barrel publishes, and a number cannot tell
 * an API from an accident. The case that produced x00541 is the proof:
 * four subsystems published their entire vocabulary — every strategy
 * union, every seam interface, every phase constant — under a comment
 * asserting that "the runtime, the guards, the generated governance and
 * the tooling" all consumed it. A sweep found ZERO importers for about
 * sixty of them. The count gate did notice, eventually, because the
 * total crossed a line; it could not say WHICH ones were unmoored, and
 * it would have said nothing at all if the same sixty had arrived a few
 * at a time.
 *
 * So this asks the question the count cannot: for each exported symbol,
 * is there an importer outside `packages/core`, and if not, has somebody
 * written down that it exists for an adopting project?
 *
 * `@delendai/core` is a published package, so "no in-repo importer" is
 * NOT proof of dead code — an adopter can depend on anything the barrel
 * exposes. That is exactly why the annotation exists: it turns an
 * assumption into a sentence somebody signed.
 *
 *   // @adopter-api the integration engine is how a consuming project
 *   // lands work; nothing in this repository calls it, and that is the
 *   // point.
 *   export { createIntegrationEngine } from '../lib/integration-engine';
 *
 * A RATCHET, not a wall. 576 of today's exports have no in-repo
 * importer; fixing that is x00541 S1/S3 and a judgement call per symbol,
 * not something a lint can do. The baseline records today's set, a NEW
 * unmoored export fails, and one that gains a consumer or an annotation
 * is reported so the win can be locked in. The number may only go down.
 *
 * Usage:
 *   bun run lint:core-public-consumers
 *   bun run lint:core-public-consumers -- --update   # rewrite the baseline
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { repoRoot } from '../lib/repo-root';
import { walkTsFiles } from '@delendai/core/public';
import { parseBarrel } from '../inspect/core-public-inventory.script';

/** Where the annotation is written, and what it looks like. */
export const ADOPTER_API_TAG = '@adopter-api';

const BARREL = 'packages/core/src/public/index.ts';
const BASELINE = 'tools/scripts/lint/core-public-consumers.baseline.json';

/** Roots a consumer can live in. `packages/core` is excluded on purpose. */
const CONSUMER_ROOTS: readonly string[] = [
	'packages',
	'plugins',
	'apps',
	'extensions',
	'tools',
];

export interface IUnmooredExport {
	readonly name: string;
	/** True when the barrel carries an `@adopter-api` note for it. */
	readonly annotated: boolean;
}

export interface IConsumerReport {
	readonly total: number;
	readonly withConsumer: number;
	readonly annotated: number;
	/** Exported, no consumer, no annotation. */
	readonly unmoored: readonly string[];
	/** Unmoored AND absent from the baseline: the ones that fail. */
	readonly newlyUnmoored: readonly string[];
	/** Baselined but no longer unmoored: the wins to lock in. */
	readonly resolved: readonly string[];
}

/**
 * The names that sit under an `@adopter-api` note.
 *
 * The list of exports itself comes from `parseBarrel`, which
 * `lint:core-public-surface-budget` and the inventory already share —
 * a second parser would be a second answer to "what does this package
 * publish", which is the duplication this repository has a lint
 * against. What that parser does not carry is the prose above a block,
 * so this scan reads only that: which names follow a note, until the
 * block closes.
 */
export const annotatedNames = (source: string): ReadonlySet<string> => {
	const parsed = parseAnnotatedBlocks(source);
	return new Set(
		parsed.filter((entry) => entry.annotated).map((entry) => entry.name),
	);
};

const parseAnnotatedBlocks = (source: string): readonly IUnmooredExport[] => {
	const out: IUnmooredExport[] = [];
	const lines = source.split('\n');
	let annotatedBlock = false;
	let inBlock = false;

	const push = (raw: string, annotated: boolean): void => {
		const name = raw
			.replace(/^\s*(?:type)\s+/u, '')
			.replace(/,$/u, '')
			.trim();
		if (name.length === 0 || name === '{' || name === '}') return;
		if (name.startsWith('//') || name.startsWith('*')) return;
		const alias = name
			.split(/\s+as\s+/u)
			.at(-1)
			?.trim();
		if (alias === undefined || alias.length === 0) return;
		out.push({ name: alias, annotated });
	};

	for (const line of lines) {
		const trimmed = line.trim();
		if (trimmed.includes(ADOPTER_API_TAG)) {
			annotatedBlock = true;
			continue;
		}
		if (inBlock) {
			if (trimmed.startsWith('}')) {
				inBlock = false;
				annotatedBlock = false;
				continue;
			}
			push(trimmed, annotatedBlock);
			continue;
		}
		if (!trimmed.startsWith('export')) {
			// A blank line or prose between a note and its block does not
			// break the association; anything else does.
			if (
				trimmed.length > 0 &&
				!trimmed.startsWith('*') &&
				!trimmed.startsWith('//')
			) {
				annotatedBlock = false;
			}
			continue;
		}
		if (trimmed.includes('{') && !trimmed.includes('}')) {
			inBlock = true;
			continue;
		}
		const inline = /export\s+(?:type\s+)?\{([^}]*)\}/u.exec(trimmed);
		if (inline?.[1] !== undefined) {
			for (const part of inline[1].split(',')) push(part, annotatedBlock);
			annotatedBlock = false;
			continue;
		}
		const direct =
			/export\s+(?:declare\s+)?(?:const|function|class|type|interface)\s+([A-Za-z0-9_]+)/u.exec(
				trimmed,
			);
		if (direct?.[1] !== undefined) push(direct[1], annotatedBlock);
		annotatedBlock = false;
	}
	return out;
};

/** Names referenced anywhere outside `packages/core`. */
export const consumerNames = async (
	root: string,
): Promise<ReadonlySet<string>> => {
	const found = new Set<string>();
	const word = /[A-Za-z_$][A-Za-z0-9_$]*/gu;
	const files = await walkTsFiles(root, [...CONSUMER_ROOTS], {
		authoredOnly: true,
	});
	const coreDir = `${join('packages', 'core')}/`;
	for (const file of files) {
		// The package cannot be its own consumer: an export that only
		// `packages/core` uses is exactly what this gate is looking for.
		if (file.startsWith(coreDir) || file.includes(`/${coreDir}`)) continue;
		let text: string;
		try {
			text = readFileSync(join(root, file), 'utf8');
		} catch {
			continue;
		}
		for (const match of text.matchAll(word)) found.add(match[0]);
	}
	return found;
};

export const judgeConsumers = (input: {
	readonly exports: readonly IUnmooredExport[];
	readonly consumers: ReadonlySet<string>;
	readonly baseline: ReadonlySet<string>;
}): IConsumerReport => {
	const unmoored: string[] = [];
	let withConsumer = 0;
	let annotated = 0;
	for (const entry of input.exports) {
		if (input.consumers.has(entry.name)) {
			withConsumer += 1;
			continue;
		}
		if (entry.annotated) {
			annotated += 1;
			continue;
		}
		unmoored.push(entry.name);
	}
	return {
		total: input.exports.length,
		withConsumer,
		annotated,
		unmoored,
		newlyUnmoored: unmoored.filter((name) => !input.baseline.has(name)),
		resolved: [...input.baseline].filter(
			(name) => !unmoored.includes(name),
		),
	};
};

const readBaseline = (root: string): ReadonlySet<string> => {
	try {
		const parsed: unknown = JSON.parse(
			readFileSync(join(root, BASELINE), 'utf8'),
		);
		const list = (parsed as { readonly unmoored?: unknown }).unmoored;
		return Array.isArray(list)
			? new Set(list.filter((v): v is string => typeof v === 'string'))
			: new Set();
	} catch {
		return new Set();
	}
};

export const main = async (
	argv: readonly string[] = process.argv.slice(2),
): Promise<number> => {
	const root = repoRoot();
	const annotated = annotatedNames(readFileSync(join(root, BARREL), 'utf8'));
	const exports = (await parseBarrel()).map((entry) => ({
		name: entry.name,
		annotated: annotated.has(entry.name),
	}));
	const report = judgeConsumers({
		exports,
		consumers: await consumerNames(root),
		baseline: readBaseline(root),
	});

	if (argv.includes('--update')) {
		writeFileSync(
			join(root, BASELINE),
			`${JSON.stringify({ unmoored: [...report.unmoored].sort() }, null, '\t')}\n`,
			'utf8',
		);
		process.stdout.write(
			`core-public-consumers: baseline updated — ${String(report.unmoored.length)} of ${String(report.total)} export(s) have neither a consumer nor an ${ADOPTER_API_TAG} note.\n`,
		);
		return 0;
	}

	if (report.newlyUnmoored.length > 0) {
		process.stderr.write(
			`✖ core-public-consumers: ${String(report.newlyUnmoored.length)} new export(s) with no consumer in this repository and no ${ADOPTER_API_TAG} note:\n` +
				report.newlyUnmoored.map((name) => `  ${name}`).join('\n') +
				`\n\n  A published export is a compatibility commitment. Either a caller\n` +
				`  in this repository uses it, or write above its block WHY an adopting\n` +
				`  project needs it:\n\n` +
				`    // ${ADOPTER_API_TAG} <who needs it, and for what>\n\n` +
				`  If the growth is deliberate and reviewed, run\n` +
				`  \`bun run lint:core-public-consumers -- --update\` to rebaseline.\n`,
		);
		return 1;
	}

	process.stdout.write(
		`✓ core-public-consumers: ${String(report.withConsumer)} consumed, ${String(report.annotated)} annotated, ${String(report.unmoored.length)} baselined (of ${String(report.total)}).` +
			(report.resolved.length > 0
				? ` ${String(report.resolved.length)} baselined export(s) now have one — run --update to lock that in.`
				: '') +
			'\n',
	);
	return 0;
};

if (import.meta.main) {
	process.exit(await main());
}
