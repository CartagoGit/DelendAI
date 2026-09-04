/**
 * store.ts — the in-memory provider-availability mirror + durable snapshot.
 *
 * CRITICAL (AGENTS.md rule 3): routing decisions must NEVER do a per-call
 * `fs` read. The runner keeps `IProviderAvailability` in an in-memory
 * `Map` (the "mirror") and reads only that on the hot path. The on-disk
 * `${cacheDir}/orchestrator-runner/healthcheck.json` is written for
 * next-boot recovery only, under `withFileMutex` (no lost updates across
 * concurrent agents) + `writeFileAtomic` (no torn reads) and passed
 * through `redactSecrets` before it ever touches the disk.
 */
import { readFile } from 'node:fs/promises';

import {
	redactSecrets,
	withFileMutex,
	writeFileAtomic,
	type IProviderAvailability,
} from '@delendai/core/public';

interface IHealthSnapshot {
	readonly schema: 'mcp-vertex/orchestrator-runner/healthcheck/1';
	readonly updatedAt: string;
	readonly providers: readonly IProviderAvailability[];
}

const SCHEMA = 'mcp-vertex/orchestrator-runner/healthcheck/1' as const;

export class HealthStore {
	private readonly mirror = new Map<string, IProviderAvailability>();

	/** Availability for a provider id; optimistic `available` when unseen. */
	get(id: string): IProviderAvailability {
		return this.mirror.get(id) ?? { id, state: 'available' };
	}

	/** Whether the mirror has an explicit entry for `id`. */
	has(id: string): boolean {
		return this.mirror.has(id);
	}

	/** Replace the whole mirror (e.g. after a full healthcheck sweep). */
	setAll(entries: readonly IProviderAvailability[]): void {
		this.mirror.clear();
		for (const entry of entries) this.mirror.set(entry.id, entry);
	}

	/** Upsert a single provider's availability. */
	set(entry: IProviderAvailability): void {
		this.mirror.set(entry.id, entry);
	}

	/** Snapshot of the current mirror. */
	list(): readonly IProviderAvailability[] {
		return [...this.mirror.values()];
	}

	/**
	 * Hydrate the mirror from a prior on-disk snapshot. Missing/corrupt file
	 * is tolerated (fresh boot, first run) and leaves the mirror empty.
	 */
	async loadFrom(absPath: string): Promise<void> {
		let raw: string;
		try {
			raw = await readFile(absPath, 'utf8');
		} catch (err) {
			if ((err as NodeJS.ErrnoException).code === 'ENOENT') return;
			return;
		}
		try {
			const parsed = JSON.parse(raw) as Partial<IHealthSnapshot>;
			if (Array.isArray(parsed.providers)) {
				this.setAll(parsed.providers as IProviderAvailability[]);
			}
		} catch {
			// corrupt snapshot → ignore, mirror stays as-is
		}
	}

	/**
	 * Persist the current mirror durably: mutex → redact → atomic write.
	 */
	async persist(absPath: string): Promise<void> {
		const snapshot: IHealthSnapshot = {
			schema: SCHEMA,
			updatedAt: new Date().toISOString(),
			providers: this.list(),
		};
		const redacted = redactSecrets(JSON.stringify(snapshot, null, '\t'));
		await withFileMutex(absPath, async () => {
			await writeFileAtomic(absPath, `${redacted.text}\n`);
		});
	}
}
