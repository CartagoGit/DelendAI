/**
 * Tutorial-i18n completeness gate (l110 s3).
 *
 * Walks `plugins/<plugin>/tutorials/<lang>/*.md` via `discoverTutorials`
 * and enforces two invariants:
 *
 * 1. **Parity**: every plugin that ships an EN tutorial must ship the
 *    same `<slug>.md` in every supported language. EN is the source of
 *    truth. A plugin with zero EN tutorials is exempt (no tutorial tab
 *    is rendered for it). A plugin with N EN tutorials must have N
 *    tutorials per language.
 *
 * 2. **Translation status**: counts tutorials that still carry
 *    `auto-translated: true` or `needs-human-review: true`. The build
 *    does NOT fail on those — they are reported as a number so a CI
 *    summary can track the rollout. Tutorials that survived the
 *    bootstrap but were never reviewed should be the focus of the
 *    next translation sprint, not a hard gate.
 *
 * Run standalone (`bun scripts/check-tutorials-i18n.ts`) or as part of
 * `build:strict` once `l110 s3` closes.
 *
 * @see scripts/translate-tutorials.sh — the bootstrap that creates the
 *   skeletons with `auto-translated: true` + `needs-human-review: true`.
 * @see docs/proposals/l110-residual-l100-web-and-i18n.md §2 s3.
 */
import { resolve, dirname, join } from 'node:path';
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import {
	discoverTutorials,
	type ITutorialReader,
} from './lib/discover-tutorials';
import { languages } from '../src/i18n/shared';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..', '..', '..');
const pluginsDir = resolve(repoRoot, 'plugins');

/** File-system reader used in production; tests inject a fake. */
const fsReader: ITutorialReader = {
	// The discoverer treats `listDirs` as "list immediate children" and
	// filters by suffix (`.md` for files, anything for subdirs). We
	// therefore return ALL entries — directories and files — and let
	// the caller decide.
	listDirs: (path: string): readonly string[] => {
		try {
			return readdirSync(path, { withFileTypes: true }).map(
				(d) => d.name,
			);
		} catch {
			return [];
		}
	},
	readFile: (path: string): string | undefined => {
		try {
			return readFileSync(path, 'utf8');
		} catch {
			return undefined;
		}
	},
	join: (...parts: readonly string[]): string => join(...parts),
};

/** Verdict produced by `runCheck`. Exported so tests can drive the
 *  same logic with synthetic tutorials instead of touching the FS. */
export interface ICheckVerdict {
	readonly parityProblems: readonly string[];
	readonly pendingReview: number;
	readonly totalFiles: number;
}

/** Pure parity check. Same inputs ⇒ same verdict. */
export const runCheck = (
	langCodes: readonly string[],
	tutorials: readonly ITutorial[],
): ICheckVerdict => {
	const enTutorials = tutorials.filter((t) => t.lang === 'en');
	const enByPlugin = new Map<string, ITutorial[]>();
	for (const en of enTutorials) {
		const list = enByPlugin.get(en.plugin) ?? [];
		list.push(en);
		enByPlugin.set(en.plugin, list);
	}

	const parityProblems: string[] = [];
	for (const [plugin, pluginEnList] of enByPlugin) {
		const pluginTutorials = tutorials.filter((t) => t.plugin === plugin);
		const missingByLang = langCodes.filter((code) => {
			if (code === 'en') return false;
			const present = pluginTutorials.filter(
				(t) => t.lang === code,
			).length;
			return present < pluginEnList.length;
		});
		if (missingByLang.length === 0) continue;
		parityProblems.push(
			`[${plugin}] EN=${pluginEnList.length} · missing in: ${missingByLang.join(', ')}`,
		);
		for (const code of langCodes) {
			if (code === 'en') continue;
			const orphans = pluginTutorials
				.filter((t) => t.lang === code)
				.filter((t) => !pluginEnList.some((e) => e.slug === t.slug))
				.map((t) => t.slug);
			if (orphans.length > 0) {
				parityProblems.push(
					`[${plugin}:${code}] orphan slugs not in EN: ${orphans.join(', ')}`,
				);
			}
		}
	}

	// "Pending review" includes any tutorial whose body was bootstrap-
	// generated (`autoTranslated: true`) and any that the bootstrap
	// flagged as still needing human review. The two flags can be set
	// independently — a tutorial may be auto-translated but already
	// reviewed (omit both flags), or human-reviewed but never auto-
	// translated (also omit both flags).
	const pendingReview = tutorials.filter(
		(t) => t.autoTranslated === true || t.needsHumanReview === true,
	).length;

	return {
		parityProblems,
		pendingReview,
		totalFiles: tutorials.length,
	};
};

// CLI entry: read the catalogue, drive the pure check, render verdict.
const langCodes = languages.map((l) => l.code);
const allTutorials = discoverTutorials(pluginsDir, langCodes, fsReader);
const verdict = runCheck(langCodes, allTutorials);

if (verdict.parityProblems.length) {
	console.error(
		'✗ Tutorial i18n parity violated — every plugin must ship its EN tutorials in every language:\n',
	);
	for (const p of verdict.parityProblems) console.error(`  ${p}`);
	console.error(
		`\n${languages.length} languages · ${verdict.totalFiles - verdict.pendingReview} EN tutorials × ${langCodes.length} langs expected.`,
	);
	process.exit(1);
}

const reviewedRatio =
	verdict.totalFiles === 0
		? 1
		: 1 - verdict.pendingReview / verdict.totalFiles;
console.log(
	`✓ Tutorial i18n parity: ${verdict.totalFiles} files (${languages.length} langs × ${verdict.totalFiles / languages.length} tutorials/plugin).`,
);
console.log(
	`  Translation status: ${verdict.pendingReview}/${verdict.totalFiles} still pending review (${(reviewedRatio * 100).toFixed(1)}% reviewed).`,
);
console.log(
	`  Bootstrap script: \`bun scripts/translate-tutorials.sh\` re-creates skeletons idempotently.`,
);
