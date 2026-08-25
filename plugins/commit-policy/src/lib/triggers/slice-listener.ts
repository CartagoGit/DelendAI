/**
 * slice-listener.ts — polls the proposals plugin's `index.json` for
 * slices whose status flipped to `done` / `merged` since the last
 * scan, and emits a `TriggerEvent` per new close.
 */

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { SafeWorkspaceReader } from '@mcp-vertex/core/public';

import type { ITriggerEvent, ISliceTriggerConfig } from './trigger-types';

const DEFAULT_POLL_MS = 5_000;

const parseIndex = (
	raw: string,
): { slices: Map<string, { status: string; proposalId: string }> } => {
	const slices = new Map<string, { status: string; proposalId: string }>();
	try {
		const parsed = JSON.parse(raw) as {
			proposals?: readonly {
				id?: string;
				slices?: readonly { id?: string; status?: string }[];
			}[];
		};
		for (const proposal of parsed.proposals ?? []) {
			if (typeof proposal.id !== 'string') continue;
			for (const slice of proposal.slices ?? []) {
				if (typeof slice.id !== 'string') continue;
				slices.set(`${proposal.id}-${slice.id}`, {
					status: slice.status ?? 'unknown',
					proposalId: proposal.id,
				});
			}
		}
	} catch {
		// corrupt/missing index — treat as empty
	}
	return { slices };
};

const diffSlices = (
	prev: ReadonlyMap<string, { status: string; proposalId: string }>,
	curr: ReadonlyMap<string, { status: string; proposalId: string }>,
	onStatuses: readonly string[],
): ITriggerEvent[] => {
	const events: ITriggerEvent[] = [];
	for (const [key, entry] of curr) {
		const prior = prev.get(key);
		const wasPresent = prior !== undefined;
		const statusChanged =
			wasPresent && prior !== undefined && prior.status !== entry.status;
		if (!wasPresent || statusChanged) {
			if (onStatuses.includes(entry.status)) {
				const dash = key.indexOf('-');
				const sliceId = dash >= 0 ? key.slice(dash + 1) : key;
				events.push({
					kind: 'slice',
					proposalId: entry.proposalId,
					sliceId,
					status: entry.status,
				});
			}
		}
	}
	return events;
};

export interface ISliceListener {
	check(): Promise<readonly ITriggerEvent[]>;
	start(): void;
	stop(): void;
}

export const createSliceListener = (
	workspaceRoot: string,
	docsDir: string,
	config: ISliceTriggerConfig,
	pollMs: number = DEFAULT_POLL_MS,
): ISliceListener => {
	const indexRel = join(docsDir, 'proposals', 'index.json');
	let prev = new Map<string, { status: string; proposalId: string }>();
	let initialized = false;
	let timer: ReturnType<typeof setInterval> | undefined;
	let reader: SafeWorkspaceReader;

	try {
		reader = new SafeWorkspaceReader(workspaceRoot);
	} catch {
		reader = new SafeWorkspaceReader(process.cwd());
	}

	const checkImpl = async (): Promise<readonly ITriggerEvent[]> => {
		let raw = '';
		try {
			raw = (await reader.readText(indexRel)).content;
		} catch {
			return [];
		}
		const curr = parseIndex(raw).slices;
		const events = initialized
			? diffSlices(prev, curr, config.onStatuses)
			: [];
		prev = curr;
		initialized = true;
		return events;
	};

	return {
		check: checkImpl,
		start() {
			if (timer !== undefined) return;
			timer = setInterval(() => {
				void checkImpl();
			}, pollMs);
			if (typeof timer.unref === 'function') timer.unref();
		},
		stop() {
			if (timer !== undefined) {
				clearInterval(timer);
				timer = undefined;
			}
		},
	};
};

export const readCurrentSliceSnapshot = async (
	workspaceRoot: string,
	docsDir: string,
): Promise<Map<string, { status: string; proposalId: string }>> => {
	const indexRel = join(docsDir, 'proposals', 'index.json');
	let raw = '';
	try {
		raw = (await new SafeWorkspaceReader(workspaceRoot).readText(indexRel))
			.content;
	} catch {
		try {
			raw = await readFile(join(workspaceRoot, indexRel), 'utf8');
		} catch {
			return new Map();
		}
	}
	return parseIndex(raw).slices;
};
