/**
 * Contention on the host's single-slot hooks, made visible.
 *
 * Most plugin registrations accumulate: every `onToolCall`, every
 * `beforeToolCall`, every error sink is kept and fanned out. Two are
 * different — `logsSink` and `isAgentStuck` are single slots, because
 * the host can only route logs to one destination and can only get one
 * answer to "is this agent stuck?". A second plugin offering either one
 * is therefore silently dropped.
 *
 * Silently is the problem. An adopter who enables a second logging
 * plugin gets a plugin that registers, reports no error, exposes its
 * tools, and simply never receives a single log line — and which of the
 * two wins depends on plugin order, so it can change when a preset
 * changes. That is the shape of "plugin interference" that costs hours:
 * nothing failed, something just quietly did not happen.
 *
 * The resolution itself stays first-wins and deterministic for both
 * slots. What changes is that the loser is named.
 */
import type {
	ISingleSlotClaim,
	ISingleSlotContention,
} from '../contracts/interfaces/single-slot-hook.interface';

export type { ISingleSlotClaim, ISingleSlotContention };

/**
 * Given the claims on one slot in resolution order, describe who won
 * and who was dropped. No lines when at most one plugin claimed it.
 */
export const buildSingleSlotContention = (
	claims: readonly ISingleSlotClaim[],
): ISingleSlotContention => {
	const bySlot = new Map<string, string[]>();
	for (const claim of claims) {
		const existing = bySlot.get(claim.slot) ?? [];
		existing.push(claim.pluginName);
		bySlot.set(claim.slot, existing);
	}
	const lines: string[] = [];
	for (const [slot, plugins] of bySlot) {
		if (plugins.length < 2) continue;
		const [winner, ...losers] = plugins;
		lines.push(
			`[delendai] "${slot}" can only have one provider: "${winner}" holds it, so ${losers
				.map((name) => `"${name}"`)
				.join(
					', ',
				)} will never be called for it. Everything else those plugins register still works — disable one of them if this is not what you meant.`,
		);
	}
	return { lines };
};

/** Write the contention notice. Never throws. */
export const announceSingleSlotContention = (
	contention: ISingleSlotContention,
	write: (line: string) => void = (line) => {
		process.stderr.write(line);
	},
): void => {
	for (const line of contention.lines) {
		try {
			write(`${line}\n`);
		} catch {
			// Best-effort by construction.
		}
	}
};
