#!/usr/bin/env bun
/**
 * check-proposal-id-drift.script.ts — f00080 (cause root for the a00044
 * fragility audit). The proposals plugin already ships a race-safe
 * per-kind id allocator (`plugins/proposals/src/lib/proposals/
 * proposal-id-allocator.ts`) that persists a `proposal-id-counters.json`
 * under the canonical cache root. Every counter increment is mutex-
 * guarded (`withFileMutex`) and the allocator is the only sanctioned way
 * to mint a new proposal id.
 *
 * In practice many agents (and humans) still author proposal files by
 * hand, picking ids without consulting the allocator. The counter goes
 * stale, the next allocator call collides with the hand-authored file,
 * and `lint:proposals` ends up reporting a `duplicate id` error on
 * a clean tree. This lint closes the loop: for every prefix, it reads
 * the counter AND the filesystem, and fails when the filesystem has an
 * id strictly greater than the counter.
 *
 * Why this is the "right" robustness fix and not just another WARN:
 *   - The counter IS the source of truth — `create_proposal` (with
 *     `kind` set) is the only tool that ever increments it.
 *   - If the counter is low, the next `allocateNextProposalId('f', …)`
 *     call would mint an id that already exists on disk → duplicate.
 *   - Surfacing the drift in `bun run validate` makes the rule visible
 *     to every CI run and every agent that loops through `auto_work`.
 *
 * Scope:
 *   - Skips files outside the proposal filename shape (`^[a-z]\d{3,}-…md$`)
 *     so audits / session notes / READMEs never participate.
 *   - Treats a missing counter file as `counters = {}` — the first run
 *     after a fresh checkout will report filesystem drift as the seed
 *     step and `bun run sync:counters` fixes it in one shot.
 *
 * Exit codes:
 *   0 — counter is in sync with the filesystem (counter ≥ max(filesystem)).
 *   1 — drift detected, the allocator would mint a colliding id next.
 */

import { readdir, readFile } from 'node:fs/promises';
import { join, relative } from 'node:path';

import { repoRoot } from '../lib/monorepo-paths';

/** Subset of `proposal-id-counters.json` we care about. */
type ICounters = Readonly<Record<string, number>>;

/** A single drift signal: filesystem has an id the counter doesn't know about. */
export interface IProposalIdDriftEntry {
	readonly prefix: string;
	readonly counterValue: number;
	readonly filesystemMax: number;
	/** Filesystem ids in the gap (counterValue+1 .. filesystemMax). */
	readonly orphanAbsPaths: readonly string[];
}

/** Filesystem ids that collide with an explicit counter value (defensive). */
export interface IProposalIdCollisionEntry {
	readonly id: string;
	readonly absPaths: readonly string[];
}

export interface IProposalIdDriftSummary {
	/** `null` when the counter file is missing — treated as "empty allocator". */
	readonly counters: ICounters | null;
	readonly drifts: readonly IProposalIdDriftEntry[];
	readonly collisions: readonly IProposalIdCollisionEntry[];
	/** True when both `drifts` and `collisions` are empty. */
	readonly ok: boolean;
}

/** Filename pattern accepted as a proposal id.
 *
 * Accepts the historical 2–4 digit ids that survived from before the
 * f00023 "renumber with padding" rule (`l99`, `p42`, `a11`) and the
 * canonical 5-digit form that the allocator now produces (`f00058`).
 * The check is intentionally permissive on width so the drift lint
 * surfaces *every* proposal in the tree, including the ones predating
 * the f00016 / f00023 migrations. The allocator itself never mints
 * 2-digit ids — see `proposal-id-allocator.ts#allocateNextProposalId`.
 */
const PROPOSAL_FILENAME = /^([a-z])(\d{2,5})-[a-z0-9-]+\.md$/;

/** Status folders under `docs/mcp-vertex/proposals/` that hold proposal files. */
const STATUS_FOLDERS: readonly string[] = [
	'',
	'ready',
	'in-progress',
	'review',
	'done',
	'paused',
	'blocked',
	'retired',
	'retired/issues',
	'done/feats',
	'done/fixes',
	'done/refactors',
	'done/audits',
	'done/chores',
	'done/docs',
	'done/tests',
	'done/plans',
	'done/resumes',
	'done/breakings',
	'done/perfs',
	'done/infras',
	'done/spikes',
];

/**
 * Walk the proposals tree and collect every absolute path whose filename
 * matches `PROPOSAL_FILENAME`. Pure over the filesystem it is given;
 * returns sorted paths so the caller can diff deterministically.
 */
export const collectProposalFiles = async (
	proposalsDirAbs: string,
): Promise<readonly string[]> => {
	const out: string[] = [];
	for (const folder of STATUS_FOLDERS) {
		const dirAbs =
			folder === '' ? proposalsDirAbs : join(proposalsDirAbs, folder);
		const entries = await readdir(dirAbs, { withFileTypes: true }).catch(
			() => [],
		);
		for (const entry of entries) {
			if (!entry.isFile()) continue;
			if (!PROPOSAL_FILENAME.test(entry.name)) continue;
			out.push(join(dirAbs, entry.name));
		}
	}
	return out.sort((a, b) => a.localeCompare(b));
};

/**
 * Parse `proposal-id-counters.json` defensively. Returns `null` when the
 * file is missing OR unparseable — both are signals that the allocator
 * has never run successfully, and the seed-from-disk step is the fix.
 */
export const readCounters = async (
	countersPathAbs: string,
): Promise<ICounters | null> => {
	const raw = await readFile(countersPathAbs, 'utf8').catch(() => null);
	if (raw === null) return null;
	try {
		const parsed = JSON.parse(raw) as unknown;
		if (parsed === null || typeof parsed !== 'object') return null;
		const out: Record<string, number> = {};
		for (const [k, v] of Object.entries(
			parsed as Record<string, unknown>,
		)) {
			if (typeof v !== 'number' || !Number.isFinite(v) || v < 0) continue;
			if (!/^[a-z]$/.test(k)) continue;
			out[k] = Math.floor(v);
		}
		return out;
	} catch {
		return null;
	}
};

/**
 * Read the filesystem, compute max id per prefix, and compare against
 * the counter. Pure over the inputs (no globals, no I/O outside what the
 * callers hand us).
 *
 * `proposalsDirAbs` and `countersPathAbs` are injected so tests can run
 * against a `mkdtemp` workspace without touching the real tree.
 */
export const detectProposalIdDrift = async (
	proposalsDirAbs: string,
	countersPathAbs: string,
): Promise<IProposalIdDriftSummary> => {
	const counters = await readCounters(countersPathAbs);
	const files = await collectProposalFiles(proposalsDirAbs);

	// Pass 1 — bucket filesystem ids by prefix. Track max and per-id paths
	// so a duplicate id surfaces as a collision entry (defensive: the
	// main duplicate-id check lives in `proposals.script.ts`; this is a
	// belt-and-braces signal for cross-prefix observers).
	const maxByPrefix = new Map<string, number>();
	const pathsById = new Map<string, string[]>();
	for (const abs of files) {
		const match = PROPOSAL_FILENAME.exec(abs.split('/').pop() ?? '');
		if (match === null) continue;
		const prefix = match[1] ?? '';
		const n = Number(match[2]);
		const prev = maxByPrefix.get(prefix) ?? 0;
		if (n > prev) maxByPrefix.set(prefix, n);
		const id = `${prefix}${String(n).padStart(5, '0')}`;
		const list = pathsById.get(id) ?? [];
		list.push(abs);
		pathsById.set(id, list);
	}

	// Pass 2 — drift: filesystem max > counter.
	const drifts: IProposalIdDriftEntry[] = [];
	for (const [prefix, filesystemMax] of maxByPrefix) {
		const counterValue = counters?.[prefix] ?? 0;
		if (filesystemMax <= counterValue) continue;
		const orphanAbsPaths = files.filter((abs) => {
			const m = PROPOSAL_FILENAME.exec(abs.split('/').pop() ?? '');
			if (m === null) return false;
			if ((m[1] ?? '') !== prefix) return false;
			const n = Number(m[2]);
			return n > counterValue;
		});
		drifts.push({ prefix, counterValue, filesystemMax, orphanAbsPaths });
	}
	drifts.sort((a, b) => a.prefix.localeCompare(b.prefix));

	// Pass 3 — collisions (filesystem itself has the same id twice).
	const collisions: IProposalIdCollisionEntry[] = [];
	for (const [id, absPaths] of pathsById) {
		if (absPaths.length < 2) continue;
		collisions.push({ id, absPaths: [...absPaths].sort() });
	}
	collisions.sort((a, b) => a.id.localeCompare(b.id));

	return {
		counters,
		drifts,
		collisions,
		ok: drifts.length === 0 && collisions.length === 0,
	};
};

const isMainModule = (): boolean => {
	const entry = process.argv[1];
	return entry !== undefined && import.meta.url === `file://${entry}`;
};

if (isMainModule()) {
	void (async () => {
		const root = repoRoot();
		// Paths mirror `plugins/proposals/src/lib/contracts/constants/
		// default-path-layout.constant.ts` so this lint and the runtime
		// agree on the layout without sharing a single source of truth
		// across the tools/ vs plugins/ boundary.
		const proposalsDirAbs = join(root, 'docs', 'mcp-vertex', 'proposals');
		const countersPathAbs = join(
			root,
			'.cache',
			'mcp-vertex',
			'proposal-id-counters.json',
		);
		const summary = await detectProposalIdDrift(
			proposalsDirAbs,
			countersPathAbs,
		);

		if (summary.counters === null) {
			console.error(
				'✖ check-proposal-id-drift: counters file is missing.',
			);
			console.error(`  expected at: ${relative(root, countersPathAbs)}`);
			console.error(
				'  fix: run any `create_proposal` call (it seeds from disk) or run',
			);
			console.error(
				'       `bun tools/scripts/proposals/sync-proposal-counters.script.ts`',
			);
			process.exit(1);
			return;
		}

		if (summary.collisions.length > 0) {
			console.error(
				`✖ check-proposal-id-drift: ${summary.collisions.length} filesystem-level collision(s):`,
			);
			for (const c of summary.collisions) {
				console.error(`  ${c.id}:`);
				for (const p of c.absPaths) {
					console.error(`    - ${relative(root, p)}`);
				}
			}
			console.error(
				'  fix: rename or merge (see `lint:proposals` for the authoritative check).',
			);
		}

		if (summary.drifts.length > 0) {
			console.error(
				`✖ check-proposal-id-drift: ${summary.drifts.length} prefix(es) have filesystem ids past the counter:`,
			);
			for (const d of summary.drifts) {
				console.error(
					`  ${d.prefix}: counter=${d.counterValue} filesystem-max=${d.filesystemMax} (gap=${d.filesystemMax - d.counterValue})`,
				);
				for (const p of d.orphanAbsPaths) {
					console.error(`    - ${relative(root, p)}`);
				}
			}
			console.error(
				'  fix: reseed the counter from disk with `bun tools/scripts/proposals/sync-proposal-counters.script.ts`.',
			);
		}

		if (!summary.ok) {
			process.exit(1);
			return;
		}

		console.log(
			'✓ check-proposal-id-drift: counter is in sync with filesystem (all prefixes have counter ≥ max(filesystem)).',
		);
	})();
}
