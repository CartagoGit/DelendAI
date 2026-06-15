import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';

import {
	CorruptFileError,
	quarantineCorruptFile,
	withFileMutex,
	writeFileAtomic,
} from '@cartago-git/mcp-core/public';

import { SUBAGENT_CONVENTIONS } from './subagent-conventions';

export type ISubagentAssignmentStatus = 'active' | 'cooldown' | 'orphan';

export type ISubagentAssignment = {
	task_id: string;
	agent_name: string;
	agent_slot: string;
	parent_task_id: string | null;
	depth: number;
	topic: string;
	adopted: boolean;
	assigned_at: string;
	last_seen: string;
	cooldown_until: string | null;
	status: ISubagentAssignmentStatus;
};

export type ISubagentAdoption = {
	name: string;
	task_id: string;
};

export type ISubagentRegistry = {
	version: number;
	adopted: ISubagentAdoption[];
	assignments: ISubagentAssignment[];
};

export interface ISubagentRegistryStore {
	readonly path: string;
	read(): Promise<ISubagentRegistry>;
	write(registry: ISubagentRegistry): Promise<void>;
	upsert(assignment: ISubagentAssignment): Promise<ISubagentRegistry>;
	remove(task_id: string): Promise<boolean>;
	release(task_id: string, cooldown_until: string): Promise<boolean>;
	markAdopted(adoption: ISubagentAdoption): Promise<ISubagentRegistry>;
}

const emptyRegistry = (): ISubagentRegistry => ({
	version: SUBAGENT_CONVENTIONS.registry_version,
	adopted: [],
	assignments: [],
});

const migrate = (raw: unknown): ISubagentRegistry => {
	if (typeof raw !== 'object' || raw === null) return emptyRegistry();
	const r = raw as Partial<ISubagentRegistry>;
	return {
		version:
			typeof r.version === 'number'
				? r.version
				: SUBAGENT_CONVENTIONS.registry_version,
		adopted: Array.isArray(r.adopted)
			? (r.adopted as ISubagentAdoption[])
			: [],
		assignments: Array.isArray(r.assignments)
			? (r.assignments as ISubagentAssignment[])
			: [],
	};
};

export const createSubagentRegistryStore = (
	path: string
): ISubagentRegistryStore => {
	const read = async (): Promise<ISubagentRegistry> => {
		if (!existsSync(path)) return emptyRegistry();
		let raw: string;
		try {
			raw = await readFile(path, 'utf8');
		} catch (err: unknown) {
			if ((err as NodeJS.ErrnoException).code === 'ENOENT') return emptyRegistry();
			throw err;
		}
		if (!raw.trim()) return emptyRegistry();
		let parsed: unknown;
		try {
			parsed = JSON.parse(raw);
		} catch (err) {
			const backup = await quarantineCorruptFile(path);
			throw new CorruptFileError(path, backup, `invalid JSON: ${String(err)}`);
		}
		return migrate(parsed);
	};

	// Atomic write: temp-in-same-dir + rename, so a reader never sees a
	// torn registry. The read-modify-write methods below wrap their whole
	// critical section in a file mutex so two agents can't lose updates.
	const write = async (registry: ISubagentRegistry): Promise<void> => {
		await writeFileAtomic(
			path,
			`${JSON.stringify(registry, null, '    ')}\n`
		);
	};

	const upsert = async (
		assignment: ISubagentAssignment
	): Promise<ISubagentRegistry> =>
		withFileMutex(path, async () => {
			const r = await read();
			const idx = r.assignments.findIndex(
				(a) => a.task_id === assignment.task_id
			);
			if (idx >= 0) {
				const prev = r.assignments[idx];
				if (prev) r.assignments[idx] = { ...prev, ...assignment };
			} else {
				r.assignments.push(assignment);
			}
			await write(r);
			return r;
		});

	const remove = async (task_id: string): Promise<boolean> =>
		withFileMutex(path, async () => {
			const r = await read();
			const before = r.assignments.length;
			r.assignments = r.assignments.filter((a) => a.task_id !== task_id);
			const removed = r.assignments.length < before;
			if (removed) await write(r);
			return removed;
		});

	const release = async (
		task_id: string,
		cooldown_until: string
	): Promise<boolean> =>
		withFileMutex(path, async () => {
			const r = await read();
			const a = r.assignments.find((x) => x.task_id === task_id);
			if (!a) return false;
			a.status = 'cooldown';
			a.cooldown_until = cooldown_until;
			a.last_seen = new Date().toISOString();
			await write(r);
			return true;
		});

	const markAdopted = async (
		adoption: ISubagentAdoption
	): Promise<ISubagentRegistry> =>
		withFileMutex(path, async () => {
			const r = await read();
			if (!r.adopted.some((a) => a.name === adoption.name)) {
				r.adopted.push(adoption);
				await write(r);
			}
			return r;
		});

	return { path, read, write, upsert, remove, release, markAdopted };
};
