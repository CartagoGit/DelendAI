/**
 * Whether a resolved version falls in a pack rule's range.
 *
 * A range is `*` or space-separated comparators (`>=17 <19`, `=17.3.2`),
 * all of which must hold. Versions compare by their numeric major, minor
 * and patch; a missing part is zero, and a pre-release tag is ignored, so
 * `17.0.0-rc.1` is treated as `17.0.0`. Anything unreadable is NOT in
 * range: a rule nobody can place is better left out than guessed at.
 */
import { ANY_VERSION } from '../contracts/constants/knowledge-pack.constant';

const COMPARATOR = /^(>=|<=|>|<|=)?(\d+(?:\.\d+){0,2})(?:[-+].*)?$/u;
const VERSION = /^v?(\d+(?:\.\d+){0,2})(?:[-+].*)?$/u;

const parts = (text: string): readonly [number, number, number] => {
	const [major = 0, minor = 0, patch = 0] = text.split('.').map(Number);
	return [major, minor, patch];
};

const compare = (
	left: readonly [number, number, number],
	right: readonly [number, number, number],
): number => {
	for (const index of [0, 1, 2] as const) {
		if (left[index] !== right[index]) return left[index] - right[index];
	}
	return 0;
};

const holds = (operator: string, order: number): boolean => {
	if (operator === '>=') return order >= 0;
	if (operator === '<=') return order <= 0;
	if (operator === '>') return order > 0;
	if (operator === '<') return order < 0;
	return order === 0;
};

export const versionInRange = (version: string, range: string): boolean => {
	const trimmed = range.trim();
	if (trimmed === ANY_VERSION) return true;
	const resolved = VERSION.exec(version.trim())?.[1];
	if (resolved === undefined || trimmed.length === 0) return false;
	return trimmed.split(/\s+/u).every((comparator) => {
		const match = COMPARATOR.exec(comparator);
		if (match === null) return false;
		return holds(
			match[1] ?? '=',
			compare(parts(resolved), parts(match[2] ?? '')),
		);
	});
};
