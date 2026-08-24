#!/usr/bin/env bun
/**
 * reap-legacy-proposals.script.ts — f00076 S2.
 *
 * Reaper: moves vintage `done/<kind>/<proposal>.md` files into
 * `legacy/closed/<kind>/<proposal>.md` so the active `done/` tree
 * stays small while history is preserved (the index keeps including
 * archived proposals — see `sync-proposal-registry.ts`).
 *
 * Two-mode CLI (matches the existing reaper pattern in
 * `tools/scripts/proposals/migrate-legacy.script.ts`):
 *
 *   bun tools/scripts/lint/reap-legacy-proposals.script.ts [--older-than=Nd] [--fallback-older-than=Nd]
 *     # dry-run (default): prints `<id>: <src> age=<N>d since=<shipped-in|date> → <dst>`
 *     # one line per match, exits 0.
 *
 *   bun tools/scripts/lint/reap-legacy-proposals.script.ts --apply
 *     # performs `git mv`, writes `archived-on: <today>` frontmatter
 *     # patch, exits 0 on success or 1 with the failed-id count.
 *
 * Why a reaper (not an auto-runner): every mutation script in
 * `tools/scripts/proposals/` follows the same dry-run-by-default
 * contract. The reaper is informational by default, and only acts
 * with the explicit `--apply` opt-in. The vintage threshold is
 * configurable; the default (30d shipped-in / 60d date fallback) is
 * deliberately conservative so a fresh `done/` cannot be accidentally
 * emptied.
 *
 * Why "vintage" rather than "older than N days from `date:`":
 *   - A proposal that shipped today but was authored 90 days ago
 *     is fresh in operator mind and must NOT be reaped.
 *   - A proposal that was authored 90 days ago AND has been sitting
 *     in `done/` for 30 days without any new slices / review / edits
 *     is the exact "done in the first sweep" case the user wants
 *     archived.
 *   - The `shipped-in:` marker exists for exactly this — it is the
 *     "moved to done" timestamp a00074 wired in. Using `shipped-in:`
 *     gives the operator the natural knob.
 *
 * Output:
 *   - One line per matched proposal in dry-run.
 *   - In `--apply`, the same lines plus a final `Applied N proposals.`
 *     (or `Applied N proposals; failed M.` if a `git mv` failed).
 */

import {
	existsSync,
	mkdirSync,
	readFileSync,
	readdirSync,
	utimesSync,
} from 'node:fs';
import { dirname, join, resolve, sep } from 'node:path';

import {
	buildVintageProposal,
	formatReaperLine,
	isReapCandidate,
	parseReaperArgs,
	planMove,
} from './lib/reap-legacy-proposals.lib';
import type { IReapFrontmatter } from './lib/reap-legacy-proposals.lib';
import { repoRoot } from '../lib/monorepo-paths';

import { createGitRunner } from '../../../plugins/proposals/src/lib/shared/git-runner';
import {
	extractYamlBlock,
	parseFrontmatterBlock,
} from '../../../plugins/proposals/src/lib/proposals/frontmatter-parser';
import { KIND_TO_DONE_SUBFOLDER } from '../../../plugins/proposals/src/lib/contracts/constants/proposal-glossary.constant';
import type { IGitRunner } from '../../../plugins/proposals/src/lib/shared/git-runner';

/**
 * Pure frontmatter read — separated so the spec can drive it with
 * fixtures without spinning up the proposals plugin's full parser.
 */
const readFrontmatter = (absPath: string): IReapFrontmatter | undefined => {
	const raw = readFileSync(absPath, 'utf8');
	const block = extractYamlBlock(raw);
	if (block === null) return undefined;
	const fm = parseFrontmatterBlock(block);
	const id = typeof fm.id === 'string' ? fm.id : '';
	const status = typeof fm.status === 'string' ? fm.status : '';
	const kind = typeof fm.kind === 'string' ? fm.kind : '';
	const title = typeof fm.title === 'string' ? fm.title : undefined;
	const date = typeof fm.date === 'string' ? fm.date : '';
	const shippedInRaw = fm['shipped-in'];
	const shippedIn =
		typeof shippedInRaw === 'string' ? shippedInRaw : undefined;
	const archivedOnRaw = fm['archived-on'];
	const archivedOn =
		typeof archivedOnRaw === 'string' ? archivedOnRaw : undefined;
	if (id === '' || status === '' || date === '') return undefined;
	return {
		id,
		status,
		kind,
		...(title !== undefined ? { title } : {}),
		date,
		...(shippedIn !== undefined ? { shippedIn } : {}),
		...(archivedOn !== undefined ? { archivedOn } : {}),
	};
};

/**
 * Walk every `done/<kind>/*.md` and yield absolute paths. Skips files
 * whose frontmatter is unreadable (returns `undefined` from
 * `readFrontmatter`) — the script reports the skip count separately.
 */
const collectDoneProposals = (
	proposalsDir: string,
): {
	readonly absPaths: ReadonlyArray<string>;
	readonly skipped: number;
} => {
	const doneDir = join(proposalsDir, 'done');
	if (!existsSync(doneDir)) return { absPaths: [], skipped: 0 };
	const out: string[] = [];
	let skipped = 0;
	for (const sub of Object.values(KIND_TO_DONE_SUBFOLDER)) {
		if (sub === undefined) continue;
		const kindDir = join(doneDir, sub);
		if (!existsSync(kindDir)) continue;
		for (const name of readdirSync(kindDir)) {
			if (!name.endsWith('.md')) continue;
			const abs = join(kindDir, name);
			const fm = readFrontmatter(abs);
			if (fm === undefined) {
				skipped += 1;
				continue;
			}
			out.push(abs);
		}
	}
	return { absPaths: out, skipped };
};

const main = async (): Promise<number> => {
	const root = repoRoot();
	const proposalsDir = resolve(root, 'docs', 'mcp-vertex', 'proposals');
	let argv: ReturnType<typeof parseReaperArgs>;
	try {
		argv = parseReaperArgs(process.argv.slice(2));
	} catch (err) {
		console.error(`✗ reap-legacy-proposals: ${(err as Error).message}`);
		return 1;
	}
	const { absPaths, skipped } = collectDoneProposals(proposalsDir);
	const vintage: Array<{
		readonly id: string;
		readonly plan: ReturnType<typeof planMove>;
		readonly ageDays: number;
		readonly ageSource: 'shipped-in' | 'date';
	}> = [];
	for (const abs of absPaths) {
		const fm = readFrontmatter(abs);
		if (fm === undefined) continue;
		const candidate = isReapCandidate(
			fm,
			argv.thresholdDays,
			argv.fallbackThresholdDays,
		);
		if (!candidate.ok) continue;
		const proposal = buildVintageProposal(
			fm,
			abs,
			proposalsDir,
			candidate.ageDays,
			candidate.ageSource,
		);
		if (proposal === undefined) continue;
		const archivedOn = new Date().toISOString().slice(0, 10);
		vintage.push({
			id: proposal.id,
			plan: planMove(proposal, proposalsDir, archivedOn),
			ageDays: candidate.ageDays,
			ageSource: candidate.ageSource,
		});
	}
	// Sort by id for deterministic output.
	vintage.sort((a, b) => a.id.localeCompare(b.id));
	for (const entry of vintage) {
		console.log(
			formatReaperLine({
				id: entry.id,
				kind: (Object.entries(KIND_TO_DONE_SUBFOLDER).find(
					([, v]) => v === entry.plan.destRelPath.split(sep)[2],
				)?.[0] ?? 'feat') as never,
				sourceAbsPath: entry.plan.sourceAbsPath,
				sourceRelPath: entry.plan.sourceAbsPath
					.slice(proposalsDir.length)
					.replace(/^[/\\]+/, ''),
				sourceFolder: 'done',
				filename: entry.plan.sourceAbsPath.split(sep).pop() ?? '',
				title: '',
				date: '',
				shippedIn: undefined,
				ageDays: entry.ageDays,
				ageSource: entry.ageSource,
			}),
		);
	}
	if (vintage.length === 0) {
		console.log(
			`✓ reap-legacy-proposals: 0 proposals to archive (${skipped} skipped unreadable)`,
		);
		return argv.apply ? 0 : 0;
	}
	if (!argv.apply) {
		console.log(
			`\nDry-run only — pass --apply to move and patch ${vintage.length} proposals.`,
		);
		return 0;
	}
	const gitRunner: IGitRunner = createGitRunner(root);
	let failed = 0;
	for (const entry of vintage) {
		const { sourceAbsPath, destAbsPath, frontmatterPatch } = entry.plan;
		mkdirSync(dirname(destAbsPath), { recursive: true });
		const moved = await gitRunner(['mv', sourceAbsPath, destAbsPath]);
		if (!moved.ok) {
			failed += 1;
			console.error(
				`  ✗ ${entry.id}: git mv failed (${moved.output.trim() || 'unknown error'})`,
			);
			continue;
		}
		const raw = readFileSync(destAbsPath, 'utf8');
		const patched = raw.startsWith('---\n')
			? raw.replace(/^---\n([\s\S]*?\n)---\n/, (_match, body: string) => {
					const lines = body.split('\n');
					const out: string[] = [];
					let wroteKey = false;
					for (const line of lines) {
						const m = /^([a-zA-Z][\w-]*):\s*(.*)$/.exec(line);
						if (m?.[1] === 'archived-on') {
							out.push(
								`archived-on: ${frontmatterPatch['archived-on']}`,
							);
							wroteKey = true;
							continue;
						}
						out.push(line);
					}
					if (!wroteKey)
						out.push(
							`archived-on: ${frontmatterPatch['archived-on']}`,
						);
					return `---\n${out.join('\n')}\n---\n`;
				})
			: `---\narchived-on: ${frontmatterPatch['archived-on']}\n---\n${raw}`;
		const { writeFileSync } = await import('node:fs');
		writeFileSync(destAbsPath, patched, 'utf8');
		// Freeze the mtime to the archived-on date so closed-frozen-guard
		// never sees a same-day write as drift (archived-on is a date; the
		// guard only grants a 60s grace window past it).
		const archivedAt = new Date(
			`${frontmatterPatch['archived-on']}T00:00:00Z`,
		);
		utimesSync(destAbsPath, archivedAt, archivedAt);
	}
	if (failed > 0) {
		console.error(
			`✗ reap-legacy-proposals: applied ${vintage.length - failed}, failed ${failed}.`,
		);
		return failed;
	}
	console.log(
		`✓ reap-legacy-proposals: applied ${vintage.length} proposals.`,
	);
	return 0;
};

process.exit(await main());
