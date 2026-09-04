/**
 * worker-registry.ts — q00013 S2.
 *
 * Tracks the count of agents actively working in the swarm.
 * Persisted at `<workspaceRoot>/.commit-policy/settlement.json`
 * with `withFileMutex` so concurrent `register` / `dispose`
 * calls across processes are safe.
 *
 * The shape is intentionally tiny:
 *
 *   { activeWorkers: number, lastZeroAt?: number }
 *
 * The settlement gate decides `activeWorkers === 0` ⇒ `settling`.
 */

import { mkdir, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

import { withFileMutex, writeFileAtomic } from '@delendai/core/public';

import type {
	ISettlementState,
	IWorkerRegistry,
	IWorkerRegistryOptions,
	ISettlementPhase,
} from '../contracts/interfaces/settlement.interface';

export type {
	ISettlementState,
	IWorkerRegistry,
	IWorkerRegistryOptions,
	ISettlementPhase,
} from '../contracts/interfaces/settlement.interface';

const DEFAULT_STATE: ISettlementState = {
	activeWorkers: 0,
	phase: 'active',
	registeringAt: {},
};

const DEFAULT_FILE = '.commit-policy/settlement.json';

const isFiniteNumber = (n: unknown): n is number =>
	typeof n === 'number' && Number.isFinite(n);

const parseState = (raw: string): ISettlementState => {
	try {
		const obj = JSON.parse(raw) as Partial<ISettlementState>;
		const activeWorkers =
			isFiniteNumber(obj.activeWorkers) && obj.activeWorkers >= 0
				? obj.activeWorkers
				: 0;
		const phase: ISettlementPhase =
			obj.phase === 'settling' || obj.phase === 'stable'
				? obj.phase
				: 'active';
		const registeringAt =
			typeof obj.registeringAt === 'object' && obj.registeringAt !== null
				? (obj.registeringAt as { readonly [k: string]: number })
				: {};
		return {
			activeWorkers,
			phase,
			...(isFiniteNumber(obj.lastZeroAt)
				? { lastZeroAt: obj.lastZeroAt }
				: {}),
			...(typeof obj.lastGreenHead === 'string'
				? { lastGreenHead: obj.lastGreenHead }
				: {}),
			registeringAt,
		};
	} catch {
		return DEFAULT_STATE;
	}
};

export const createWorkerRegistry = (
	options: IWorkerRegistryOptions,
): IWorkerRegistry => {
	const fileRel = options.fileRel ?? DEFAULT_FILE;
	const fileAbs = join(options.workspaceRoot, fileRel);

	const readState = async (): Promise<ISettlementState> => {
		try {
			const raw = await readFile(fileAbs, 'utf8');
			return parseState(raw);
		} catch (error) {
			if (
				typeof error === 'object' &&
				error !== null &&
				'code' in error &&
				(error as { readonly code?: unknown }).code === 'ENOENT'
			) {
				return DEFAULT_STATE;
			}
			throw error;
		}
	};

	const writeState = async (next: ISettlementState): Promise<void> => {
		await mkdir(dirname(fileAbs), { recursive: true });
		await writeFileAtomic(fileAbs, `${JSON.stringify(next, null, 2)}\n`);
	};

	return {
		async register(agentId) {
			await withFileMutex(fileAbs, async () => {
				const state = await readState();
				const registeringAt = { ...state.registeringAt };
				registeringAt[agentId] = Date.now();
				const activeWorkers = Object.keys(registeringAt).length;
				await writeState({ ...state, registeringAt, activeWorkers });
			});
		},
		async dispose(agentId) {
			await withFileMutex(fileAbs, async () => {
				const state = await readState();
				if (!(agentId in state.registeringAt)) return;
				const registeringAt = { ...state.registeringAt };
				delete registeringAt[agentId];
				const activeWorkers = Object.keys(registeringAt).length;
				const next: ISettlementState = {
					...state,
					registeringAt,
					activeWorkers,
					...(activeWorkers === 0 && state.lastZeroAt === undefined
						? { lastZeroAt: Date.now() }
						: {}),
				};
				await writeState(next);
			});
		},
		async read() {
			return withFileMutex(fileAbs, async () => readState());
		},
		async setPhase(phase) {
			await withFileMutex(fileAbs, async () => {
				const state = await readState();
				await writeState({ ...state, phase });
			});
		},
		async markGreen(headSha) {
			await withFileMutex(fileAbs, async () => {
				const state = await readState();
				await writeState({
					...state,
					phase: 'stable',
					lastGreenHead: headSha,
				});
			});
		},
	};
};
