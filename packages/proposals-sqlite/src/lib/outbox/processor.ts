import { OutboxRepo, type IOutboxRecord } from '../repository/outbox-repo';

export type TOutboxHandler = (record: IOutboxRecord) => void;

export interface IOutboxProcessorOptions {
	readonly workerId: string;
	readonly leaseDurationMs?: number;
	readonly maxAttempts?: number;
	readonly handlers: Readonly<Record<string, TOutboxHandler>>;
}

export interface IOutboxTickResult {
	readonly claimed: number;
	readonly completed: number;
	readonly retried: number;
	readonly failed: number;
	readonly busy: number;
}

const MAX_BACKOFF_MS = 60_000;

const retryDelayMs = (attempts: number): number =>
	Math.min(1_000 * 2 ** Math.max(0, attempts - 1), MAX_BACKOFF_MS);

/**
 * Synchronous, in-process outbox delivery loop. Claiming is durable before a
 * handler runs, so a later processor can reclaim an abandoned lease.
 */
export class OutboxProcessor {
	private readonly repo: OutboxRepo;
	private readonly options: Required<
		Pick<IOutboxProcessorOptions, 'workerId' | 'leaseDurationMs' | 'maxAttempts'>
	> &
		Pick<IOutboxProcessorOptions, 'handlers'>;

	constructor(
		db: ConstructorParameters<typeof OutboxRepo>[0],
		options: IOutboxProcessorOptions,
	) {
		this.repo = new OutboxRepo(db);
		this.options = {
			workerId: options.workerId,
			leaseDurationMs: options.leaseDurationMs ?? 30_000,
			maxAttempts: options.maxAttempts ?? 10,
			handlers: options.handlers,
		};
	}

	tick(now: number): IOutboxTickResult {
		const result = {
			claimed: 0,
			completed: 0,
			retried: 0,
			failed: 0,
			busy: 0,
		};

		for (const pending of this.repo.listPending(now)) {
			const claim = this.repo.markInFlight({
				id: pending.id,
				leaseOwner: this.options.workerId,
				leaseDurationMs: this.options.leaseDurationMs,
				now,
			});
			if (claim.kind !== 'claimed') {
				result.busy += 1;
				continue;
			}
			result.claimed += 1;

			try {
				const handler = this.options.handlers[claim.record.kind];
				if (!handler) throw new Error(`no handler for outbox kind ${claim.record.kind}`);
				handler(claim.record);
				const settled = this.repo.markDone({
					id: claim.record.id,
					leaseOwner: this.options.workerId,
					now,
				});
				if (settled.kind === 'settled') result.completed += 1;
				else result.busy += 1;
			} catch (error) {
				const lastError = error instanceof Error ? error.message : String(error);
				if (claim.record.attempts >= this.options.maxAttempts) {
					const settled = this.repo.markFailed({
						id: claim.record.id,
						leaseOwner: this.options.workerId,
						lastError,
						nextAttemptAt: now,
						now,
					});
					if (settled.kind === 'settled') result.failed += 1;
					else result.busy += 1;
					continue;
				}
				this.repo.updateStatus(claim.record.id, {
					status: 'pending',
					attemptsDelta: 0,
					lastError,
					nextAttemptAt: now + retryDelayMs(claim.record.attempts),
					leaseOwner: null,
					leaseExpiresAt: null,
					updatedAt: now,
				});
				result.retried += 1;
			}
		}
		return result;
	}
}
