/**
 * work-ref-moves.service.ts — a ref taken and put back in a loop is said.
 *
 * From 2026-10-16 18:27 to 2026-10-17 07:27 (UTC) one unit's ref was
 * deleted from the forge 46 times and pushed back each time: one
 * component withdrew it as landed, the next pass of another restored it.
 * Each did what its own rule said, and nothing recorded either, so the
 * loop was found in the forge's event log a day later. Every component
 * that takes a work ref off the forge or puts one back records it here,
 * in the clone's git directory (shared by every worktree, never
 * committed), and the doctor and `work status` name a ref undone and
 * redone more than twice in a day, with the components on each side.
 */
import { execFileSync } from 'node:child_process';
import { appendFile, mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { hostname } from 'node:os';
import { dirname, join } from 'node:path';

import type { IGitRunner } from '../contracts/interfaces/git-runner.interface';
import type {
	IWorkRefLoop,
	IWorkRefMoveRecord,
	IWorkRefMove,
} from '../contracts/interfaces/work-ref-moves.interface';
import type { IInvariantResult } from '../contracts/interfaces/workflow-invariants.interface';

const DAY_MS = 86_400_000;
/** More cycles than this in a day is a loop, not a slice landing. */
const LOOP_CYCLES = 2;
/** Past this size the file keeps only the last day. */
const PRUNE_BYTES = 512 * 1024;
const FILE = 'delendai/work-ref-moves.jsonl';

/** The journal, from a clone's git common directory. */
export const workRefMovesPath = (gitCommonDir: string): string =>
	join(gitCommonDir, FILE);

/** The journal of the clone at `root`, or `undefined` outside git. */
export const workRefMovesPathAt = (root: string): string | undefined => {
	try {
		return workRefMovesPath(
			execFileSync(
				'git',
				['rev-parse', '--path-format=absolute', '--git-common-dir'],
				{
					cwd: root,
					encoding: 'utf8',
					stdio: ['ignore', 'pipe', 'ignore'],
				},
			).trim(),
		);
	} catch {
		return undefined;
	}
};

/** The same, through a git runner. */
export const workRefMovesPathVia = async (
	run: IGitRunner,
): Promise<string | undefined> => {
	const dir = await run([
		'rev-parse',
		'--path-format=absolute',
		'--git-common-dir',
	]);
	return dir.ok ? workRefMovesPath(dir.output.trim()) : undefined;
};

/** Who is moving: the component, in this process on this machine. */
export const workRefMover = (component: string): string =>
	`${component}@${hostname()}#${String(process.pid)}`;

const parse = (text: string): IWorkRefMoveRecord[] =>
	text.split('\n').flatMap((line) => {
		if (line.trim().length === 0) return [];
		try {
			const parsed: unknown = JSON.parse(line);
			if (typeof parsed !== 'object' || parsed === null) return [];
			const record: Partial<IWorkRefMoveRecord> = parsed;
			return typeof record.at === 'number' &&
				typeof record.ref === 'string' &&
				typeof record.move === 'string' &&
				typeof record.by === 'string'
				? [record as IWorkRefMoveRecord]
				: [];
		} catch {
			return [];
		}
	});

const readMoves = async (path: string): Promise<IWorkRefMoveRecord[]> => {
	try {
		return parse(await readFile(path, 'utf8'));
	} catch {
		return [];
	}
};

/**
 * Record a move. Never fails the step that made it: a journal that cannot
 * be written costs the report, not the work.
 */
export const recordWorkRefMove = async (
	path: string | undefined,
	ref: string,
	move: IWorkRefMove,
	by: string,
	now: number = Date.now(),
): Promise<void> => {
	if (path === undefined) return;
	try {
		await mkdir(dirname(path), { recursive: true });
		const record: IWorkRefMoveRecord = {
			at: now,
			ref: ref.replace(/^refs\/heads\//u, ''),
			move,
			by,
		};
		await appendFile(path, `${JSON.stringify(record)}\n`, 'utf8');
		if ((await stat(path)).size > PRUNE_BYTES) {
			const kept = (await readMoves(path)).filter(
				(each) => now - each.at < DAY_MS,
			);
			await writeFile(
				path,
				kept.map((each) => `${JSON.stringify(each)}\n`).join(''),
				'utf8',
			);
		}
	} catch {
		// Unwritable: the move stands, unrecorded.
	}
};

const removal = (move: IWorkRefMove): boolean =>
	move === 'withdraw' || move === 'reap';

/** The refs taken and put back more than twice within the last day. */
export const workRefLoops = (
	moves: readonly IWorkRefMoveRecord[],
	now: number = Date.now(),
): IWorkRefLoop[] => {
	const byRef = new Map<string, IWorkRefMoveRecord[]>();
	for (const each of moves) {
		if (now - each.at >= DAY_MS) continue;
		byRef.set(each.ref, [...(byRef.get(each.ref) ?? []), each]);
	}
	return [...byRef.entries()].flatMap(([ref, list]) => {
		const sorted = [...list].sort((a, b) => a.at - b.at);
		let cycles = 0;
		let removed = false;
		const removedBy = new Set<string>();
		const restoredBy = new Set<string>();
		for (const each of sorted) {
			if (removal(each.move)) {
				removed = true;
				removedBy.add(each.by);
			} else if (removed) {
				cycles += 1;
				removed = false;
				restoredBy.add(each.by);
			}
		}
		return cycles > LOOP_CYCLES
			? [
					{
						ref,
						cycles,
						removedBy: [...removedBy].sort(),
						restoredBy: [...restoredBy].sort(),
					},
				]
			: [];
	});
};

/** The loops the clone at `root` recorded. */
export const workRefLoopsAt = async (
	root: string,
	now: number = Date.now(),
): Promise<IWorkRefLoop[]> => {
	const path = workRefMovesPathAt(root);
	return path === undefined ? [] : workRefLoops(await readMoves(path), now);
};

/** One loop, in a sentence. */
export const describeLoop = (loop: IWorkRefLoop): string =>
	`${loop.ref} taken off the forge and put back ${String(loop.cycles)} times today: removed by ${loop.removedBy.join(', ')}; put back by ${loop.restoredBy.join(', ')}`;

/** The doctor's reading of the journal of the clone at `root`. */
export const workRefLoopsInvariant = async (
	root: string,
	/** Seconds since the epoch, as the doctor's clock gives it. */
	nowSeconds?: number | undefined,
): Promise<IInvariantResult> =>
	loopsInvariant(
		await workRefLoopsAt(
			root,
			nowSeconds === undefined ? undefined : nowSeconds * 1000,
		),
	);

const loopsInvariant = (loops: readonly IWorkRefLoop[]): IInvariantResult => ({
	scope: 'checkout',
	id: 'no-work-ref-loops',
	claim: 'no work ref is taken off the forge and put back in a loop',
	holds: loops.length === 0,
	observed:
		loops.length === 0
			? 'none'
			: loops.slice(0, 3).map(describeLoop).join('; '),
	remedy: "the components named disagree on the ref's life: one of them runs older rules (restart the servers `status` says are behind) or is a bug to report with this line",
});
