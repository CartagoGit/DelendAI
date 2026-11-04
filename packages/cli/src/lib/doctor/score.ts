/**
 * doctor/score.ts — f00191 / q00006 Track I.
 *
 * Computes the 0–100 health score and the P0/P1/P2 priority buckets
 * the proposal asks for.
 *
 * Score: `100 - (P0 × 25) - (P1 × 10)`, floored at 0.
 *   - P0 = error sections (must fix; the host is unusable)
 *   - P1 = warn sections  (should fix; quality regression)
 *   - P2 = reserved       (cosmetic — NOT counted into the score yet;
 *                          kept on the surface so a future check that
 *                          needs cosmetic flags can opt in without a
 *                          breaking change to the report shape).
 *
 * `ok` findings do NOT reduce the score. `Health: 100/100` means
 * every section is healthy; `Health: 75/100` means exactly one P0.
 *
 * The constants are deliberate: a single P0 always makes the score
 * plunge below 75, two P0 → 50, three P0 → 25, four or more P0 → 0.
 * One P1 alone knocks 10 points.
 *
 * Pure: takes the section list, returns the score + buckets.
 */
import type { IDoctorSection } from './types';

export const P0_WEIGHT = 25;
export const P1_WEIGHT = 10;

export interface IDoctorScore {
	readonly value: number;
	readonly p0: readonly string[];
	readonly p1: readonly string[];
	readonly p2: readonly string[];
}

export const computeScore = (
	sections: readonly IDoctorSection[],
): IDoctorScore => {
	let p0Count = 0;
	let p1Count = 0;
	const p0: string[] = [];
	const p1: string[] = [];
	const p2: string[] = [];
	for (const section of sections) {
		// `ok` findings are intentionally not bucketed: a healthy
		// doctor must be able to say `Health: 100/100` even when
		// there are dozens of `ok` findings (e.g. many loaded
		// plugins). The p2 bucket is reserved for cosmetic-style flags
		// that future checks may emit explicitly; no current check
		// does.
		if (section.status === 'ok') continue;
		for (const finding of section.findings) {
			if (section.status === 'error') {
				p0Count += 1;
				p0.push(`${section.name}: ${finding}`);
			} else if (section.status === 'warn') {
				p1Count += 1;
				p1.push(`${section.name}: ${finding}`);
			}
		}
	}
	const raw = 100 - p0Count * P0_WEIGHT - p1Count * P1_WEIGHT;
	const value = raw < 0 ? 0 : raw;
	return { value, p0, p1, p2 };
};
