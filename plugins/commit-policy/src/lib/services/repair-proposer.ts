/**
 * repair-proposer.ts — x00419 S5 (revised 2026-09-07).
 *
 * Given a StormDetector snapshot with one or more storms that
 * crossed the threshold, file a `kind: fix` proposal under
 * `docs/delendai/proposals/ready/fixes/`. The proposal is
 * single-purpose: its `## Slices` lists the source file
 * extracted from the storm's `suggestedFix` hint (which usually
 * points to a single source file).
 *
 * ## Why `kind: fix` (not `kind: repair`)
 *
 * Pre-revision this proposer emitted `kind: repair` proposals
 * into `ready/repairs/`. That was wrong on three axes:
 *
 *   1. The canonical `repair` kind (prefix `e`) is reserved
 *      for q00013 S4 settlement-driven repair slices filed
 *      through `proposals/src/lib/auto-work/repair-mode.ts`.
 *      A storm-detected failure is NOT a settlement failure;
 *      it is a repeating bug.
 *   2. The auto-generated filename was hand-rolled as
 *      `xauto-<code>-<date>-<hash>-auto-repair-<code>.md`,
 *      with the literal `id: auto` in the frontmatter — both
 *      violations of the canonical filename contract
 *      (`<prefix><5+digits>-<kebab-slug>.md`, ids allocated by
 *      `create_proposal`).
 *   3. The target folder `ready/repairs/` did not exist in the
 *      canonical kind list (see `KIND_TO_DONE_SUBFOLDER`) and
 *      was unreachable from the auto-work cascade.
 *
 * The host boot step (S5 wiring) calls this once on each plugin
 * load. It is idempotent: a proposal with the same storm
 * identity (`code` + `firstSeenAt`) is not re-created. The
 * writer scans the canonical `ready/fixes/` folder first; if it
 * finds a matching `storm:` block it returns `already exists`,
 * then still syncs the proposals index so the existing file
 * cannot remain invisible.
 *
 * ## Why allocate + sync here
 *
 * `createProposalDocument` lives in the `proposals` plugin and is
 * not exported as a programmatic entry point — it is only reachable
 * via the MCP tool layer. But the public barrel DOES expose the
 * canonical id allocator and the registry sync. So this proposer now
 * does the next-best thing: allocate the `xNNNNN` id through the same
 * shared counter `create_proposal` uses, write a canonical markdown
 * document under the canonical folder, then run `syncProposalRegistry`
 * immediately. That closes the old gap where a boot hook could leave a
 * correct file on disk but an out-of-date index in cache.
 */

import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';

import {
	allocateNextProposalId,
	buildSwarmPaths,
	proposalFolderFor,
	syncProposalRegistry,
} from '@delendai/proposals/public';

import type { IStorm } from './storm-detector';

import type {
	IRepairProposalResult,
	IRepairProposerOptions,
} from '../contracts/interfaces/repair-proposer.interface';

export type {
	IRepairProposalResult,
	IRepairProposerOptions,
} from '../contracts/interfaces/repair-proposer.interface';

/**
 * Sanitise a refusal code into a lowercase kebab slug.
 * `WORKSPACE_HAS_NO_FILES` → `workspace-has-no-files`.
 */
export const stormSlug = (code: string): string =>
	code
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '')
		.slice(0, 60);

/**
 * Extract the source-file hint from a `suggestedFix` line of the
 * form "<filename>: <rest>". Conservative: if no `:` is present,
 * returns undefined so the proposal falls back to no `Files:`
 * constraint and lets the resolver surface a WARN.
 */
export const inferSourceFile = (
	hint: string | undefined,
): string | undefined => {
	if (hint === undefined) return undefined;
	const colon = hint.indexOf(':');
	if (colon <= 0) return undefined;
	const candidate = hint.slice(0, colon).trim();
	if (
		candidate.length === 0 ||
		candidate.includes(' ') ||
		candidate.startsWith('(')
	) {
		return undefined;
	}
	if (candidate.endsWith('.ts') || candidate.endsWith('.json')) {
		return candidate;
	}
	return undefined;
};

const READY_FIXES_DIR = proposalFolderFor('ready', 'fix');
const READY_FIXES_SUBDIR = READY_FIXES_DIR.startsWith('ready/')
	? READY_FIXES_DIR.slice('ready/'.length)
	: READY_FIXES_DIR;

export const buildRepairProposalFilename = (
	id: string,
	storm: IStorm,
): string => {
	const slug = stormSlug(storm.code);
	return join(READY_FIXES_SUBDIR, `${id}-${slug}.md`);
};

const stormFirstSeenIso = (storm: IStorm): string =>
	new Date(storm.firstSeenAt).toISOString();

const proposalIdFromFilePath = (filePath: string): string | undefined => {
	const match = basename(filePath).match(/^([a-z]\d{5,})-/);
	return match?.[1];
};

const existingProposalForStorm = (
	fixesDir: string,
	storm: IStorm,
): string | undefined => {
	let entries: string[];
	try {
		entries = readdirSync(fixesDir);
	} catch {
		return undefined;
	}
	const expectedCode = `  code: ${storm.code}`;
	const expectedFirstSeenAt = `  firstSeenAt: ${stormFirstSeenIso(storm)}`;
	for (const entry of entries) {
		if (!entry.endsWith('.md')) continue;
		try {
			const body = readFileSync(join(fixesDir, entry), 'utf8');
			if (
				body.includes('\nstorm:\n') &&
				body.includes(expectedCode) &&
				body.includes(expectedFirstSeenAt)
			) {
				return join(READY_FIXES_SUBDIR, entry);
			}
		} catch {
			continue;
		}
	}
	return undefined;
};

/**
 * Build the canonical proposal body (frontmatter + Goal + why +
 * non-goals + Slices + acceptance). The storm metadata is
 * preserved under a `storm:` extra-frontmatter block so a human
 * reading the proposal can still see why it was filed, without
 * polluting the canonical schema.
 */
const buildBody = (
	storm: IStorm,
	id: string,
	sourceFile: string | undefined,
	createdAt: Date,
): string => {
	const date = createdAt.toISOString().slice(0, 10);
	const title = `Storm ${storm.code}: ${storm.count}× in ${storm.windowSeconds}s`;
	const goal =
		storm.suggestedFix !== undefined
			? `Stop the engine from emitting \`${storm.code}\` repeatedly. Producer hint: ${storm.suggestedFix.replace(/\n/g, ' ')}`
			: `Stop the engine from emitting \`${storm.code}\` repeatedly in the ${storm.trigger} trigger.`;
	const why = `Storm detector observed \`${storm.code}\` ${storm.count} times in a ${storm.windowSeconds}s sliding window (firstSeenAt=${new Date(storm.firstSeenAt).toISOString()}, lastSeenAt=${new Date(storm.lastSeenAt).toISOString()}). The host boot hook (x00419 S5) filed this proposal so the cause is investigated, not just logged.`;
	const filesLine =
		sourceFile !== undefined
			? `- \`${sourceFile}\``
			: '- TBD — producer did not supply a source-file hint';
	const acceptance =
		sourceFile !== undefined
			? [
					`\`${storm.code}\` is no longer the top storm after the fix lands`,
					`${sourceFile} no longer routes through the fall-through path that produced \`${storm.code}\``,
					`bun run validate passes for the affected plugin(s)`,
				]
			: [
					`Root cause of \`${storm.code}\` is identified and added to this proposal's ## Files`,
					`Acceptance criteria added once the file is known`,
				];
	const stormBlock = [
		'storm:',
		`  code: ${storm.code}`,
		`  trigger: ${storm.trigger}`,
		`  count: ${storm.count}`,
		`  windowSeconds: ${storm.windowSeconds}`,
		`  firstSeenAt: ${new Date(storm.firstSeenAt).toISOString()}`,
		`  lastSeenAt: ${new Date(storm.lastSeenAt).toISOString()}`,
		...(storm.suggestedFix !== undefined
			? [`  suggestedFix: ${storm.suggestedFix.replace(/\n/g, ' ')}`]
			: []),
		'auto_generated: true',
	].join('\n');
	const sampleBlock =
		storm.sampleProposalIds.length > 0
			? [
					'',
					'## Sample proposal IDs implicated',
					'',
					...storm.sampleProposalIds.map((sample) => `- ${sample}`),
					'',
				]
			: [];
	return [
		'---',
		`id: ${id}`,
		`title: ${JSON.stringify(title)}`,
		'kind: fix',
		'status: ready',
		'type: proposal',
		'track: general',
		`date: ${date}`,
		'priority: P1',
		`created: ${createdAt.toISOString()}`,
		`author: x00419-auto-repair`,
		stormBlock,
		'slices:',
		'  - id: S1',
		`    title: Fix ${storm.code} (auto-generated repair proposal)`,
		'---',
		'',
		`# ${id} — ${title}`,
		'',
		'## Goal',
		'',
		goal,
		'',
		'## why',
		'',
		why,
		'',
		'## non-goals',
		'',
		'- Do not rename the refusal code; other tooling already depends on it.',
		'- Do not touch the storm detector or the boot hook — only the producer.',
		'',
		'## Slices',
		'',
		'- global_gate: lint',
		'',
		'### S1 — Investigate the fall-through path',
		'- **Status**: pending',
		`- **Files**: ${filesLine}`,
		'- **Gate**: type',
		'- acceptance:',
		acceptance.map((a) => `  - "${a}"`).join('\n'),
		'',
		...sampleBlock,
	].join('\n');
};

/**
 * For each storm where `exceedsThreshold === true` AND
 * `sampleProposalIds.length >= 1`, file a `kind: fix`
 * proposal under `<docsDir>/proposals/ready/fixes/`. Returns
 * one result per storm in the snapshot.
 */
export const fileRepairProposals = async (
	storms: readonly IStorm[],
	options: IRepairProposerOptions,
): Promise<readonly IRepairProposalResult[]> => {
	const now = options.now ?? new Date();
	const layout = buildSwarmPaths(options.cacheDir, options.docsDir);
	const proposalsDirAbs = resolve(options.workspaceRoot, layout.proposalsDir);
	const counterPathAbs = resolve(
		options.workspaceRoot,
		layout.proposalIdCountersFile,
	);
	const fixesDir = join(proposalsDirAbs, READY_FIXES_DIR);
	const results: IRepairProposalResult[] = [];
	const syncedResultIndexes: number[] = [];

	for (const storm of storms) {
		if (!storm.exceedsThreshold || storm.sampleProposalIds.length < 1) {
			results.push({
				storm,
				filePath: '',
				proposed: false,
				reason: storm.exceedsThreshold
					? 'sampleProposalIds < 1'
					: 'count < threshold',
			});
			continue;
		}
		const existing = existingProposalForStorm(fixesDir, storm);
		if (existing !== undefined) {
			results.push({
				storm,
				filePath: existing,
				proposed: false,
				reason: 'already exists',
			});
			syncedResultIndexes.push(results.length - 1);
			continue;
		}
		const sourceFile = inferSourceFile(storm.suggestedFix);
		const id = await allocateNextProposalId('x', {
			proposalsDirAbs,
			counterPathAbs,
		});
		const filename = buildRepairProposalFilename(id, storm);
		const fullPath = join(proposalsDirAbs, 'ready', filename);
		try {
			mkdirSync(fixesDir, { recursive: true });
			// `wx` is the idempotency check AND the write in one atomic
			// syscall. Two agents observing "does not exist" for the
			// same storm both raced through `existsSync` + plain write
			// and the second silently overwrote the first. EEXIST is
			// the answer to "already exists", reported below rather
			// than thrown.
			writeFileSync(fullPath, buildBody(storm, id, sourceFile, now), {
				encoding: 'utf8',
				flag: 'wx',
			});
			results.push({
				storm,
				filePath: filename,
				proposed: true,
				reason: 'created',
			});
			syncedResultIndexes.push(results.length - 1);
		} catch (error: unknown) {
			if ((error as NodeJS.ErrnoException).code === 'EEXIST') {
				results.push({
					storm,
					filePath: filename,
					proposed: false,
					reason: 'already exists',
				});
				syncedResultIndexes.push(results.length - 1);
				continue;
			}
			results.push({
				storm,
				filePath: filename,
				proposed: false,
				reason: `write failed: ${
					error instanceof Error ? error.message : String(error)
				}`,
			});
		}
	}
	if (syncedResultIndexes.length > 0) {
		try {
			const sync = await syncProposalRegistry(options.workspaceRoot, {
				proposalsDir: layout.proposalsDir,
				proposalIndexFile: layout.proposalIndexFile,
			});
			for (const index of syncedResultIndexes) {
				const result = results[index];
				if (result === undefined) continue;
				const proposalId = proposalIdFromFilePath(result.filePath);
				if (proposalId === undefined) continue;
				const syncedEntry = sync.proposals.find(
					(proposal) => proposal.id === proposalId,
				);
				if (syncedEntry === undefined) continue;
				results[index] = {
					...result,
					filePath: syncedEntry.file.replace(/^ready\//, ''),
				};
			}
		} catch (error: unknown) {
			const message =
				error instanceof Error ? error.message : String(error);
			for (const index of syncedResultIndexes) {
				const result = results[index];
				if (result === undefined || result.filePath === '') continue;
				results[index] = {
					...result,
					reason: `${result.reason}; index sync failed: ${message}`,
				};
			}
		}
	}
	return results;
};
