/**
 * start-clock.ts — pair `onToolStart` with `onToolCall` to derive
 * `durationMs`.
 *
 * The observability hooks carry no correlation id, so we key pending
 * starts by tool name and pair FIFO: `onToolStart` enqueues a timestamp,
 * `onToolCall` dequeues the oldest one for the same tool. This is robust
 * to concurrent and re-entrant calls of the SAME tool (each start gets its
 * own slot) without inventing a host contract. An unmatched completion
 * (start never observed) simply yields a `null` duration.
 */
export class StartClock {
	private readonly pending = new Map<string, number[]>();

	/** Record a start time for `toolName`. */
	begin(toolName: string, at: number): void {
		const queue = this.pending.get(toolName);
		if (queue) queue.push(at);
		else this.pending.set(toolName, [at]);
	}

	/** Take the oldest pending start for `toolName`, or undefined. */
	take(toolName: string): number | undefined {
		const queue = this.pending.get(toolName);
		if (!queue || queue.length === 0) return undefined;
		const at = queue.shift();
		if (queue.length === 0) this.pending.delete(toolName);
		return at;
	}

	/** Number of currently un-paired starts (test/introspection aid). */
	get pendingCount(): number {
		let total = 0;
		for (const queue of this.pending.values()) total += queue.length;
		return total;
	}
}
