/**
 * path-contained.ts — platform-aware path containment check.
 *
 * x00518 / B10 fix: the previous code in `sync-proposal-registry.ts`,
 * `proposal-paths.ts`, and `continue-proposal.tool.ts` used
 * `childAbs.startsWith(`${parent}/`)` to check containment. That
 * pattern is POSIX-only: on Windows, `path.join` produces
 * `C:\…\proposals\done` while the check expects `C:/…/proposals/done/`,
 * and the recursion silently returns nothing.
 *
 * `isContained` uses `relative()` (platform-aware) and accepts the
 * child iff the computed `relative` is non-empty, does not start
 * with `..`, and is not absolute. The companion
 * `isContainedWithReason` returns the actual computed `relative`
 * value so diagnostic surfaces (`state_health`) can show WHY a path
 * was rejected.
 *
 * @example
 *   isContained('/a/b/c', '/a/b') === true  // POSIX
 *   isContained('C:\\a\\b\\c', 'C:\\a\\b') === true  // Windows (with path.win32.join input)
 *   isContained('/a/../etc/passwd', '/a') === false  // parent-escape attempt
 *   isContained('/a', '/a') === false  // exact-equal is NOT contained (root doesn't contain itself for recursive scans)
 */
import { isAbsolute, relative } from 'node:path';

export interface IContainmentResult {
	/** True iff `child` lives inside `parent` (strict — not equal). */
	readonly contained: boolean;
	/** The computed `relative(parent, child)`, useful for diagnostics. */
	readonly relative: string;
	/** A stable label for why `contained === false`. */
	readonly reason:
		| 'child-equals-parent'
		| 'parent-escape'
		| 'absolute-on-child'
		| 'inside';
}

/**
 * `path.isAbsolute` is platform-sensitive: on POSIX it returns
 * `false` for `C:\…` and on Windows it returns `false` for
 * `/…`. Because the test suite runs on POSIX runners but the
 * proposal reconciliador must work on Windows too, we accept
 * any path that looks absolute under EITHER platform.
 *
 * The "looks absolute" check:
 * - POSIX: starts with `/`.
 * - Windows: starts with a drive letter (`C:\`, `D:/`, etc.) OR a
 *   UNC prefix (`\\server\share`).
 */
const looksAbsolute = (p: string): boolean => {
	if (isAbsolute(p)) return true;
	if (/^[a-zA-Z]:[\\/]/.test(p)) return true;
	if (p.startsWith('\\\\')) return true;
	return false;
};

/**
 * `relative()` is also platform-sensitive: on POSIX it treats
 * `C:\\a\\b\\c` vs `C:\\a\\b` as completely unrelated paths (the
 * `\\` separator means nothing on Linux). To make the helper work
 * on either platform from a POSIX runner, we detect Windows paths
 * and route through `win32.relative` instead.
 */
const detectPlatform = (a: string, b: string): 'win32' | 'posix' => {
	if (/^[a-zA-Z]:[\\/]/.test(a) || /^[a-zA-Z]:[\\/]/.test(b)) return 'win32';
	if (a.startsWith('\\\\') || b.startsWith('\\\\')) return 'win32';
	return 'posix';
};

const relativeForPlatform = (
	platform: 'win32' | 'posix',
	parentAbs: string,
	childAbs: string,
): string => {
	if (platform === 'win32') {
		// Dynamic require so the test runner on POSIX doesn't pay
		// the cost when only POSIX paths are processed.
		const { relative: winRelative } =
			require('node:path/win32') as typeof import('node:path/win32');
		return winRelative(parentAbs, childAbs);
	}
	return relative(parentAbs, childAbs);
};

const compute = (childAbs: string, parentAbs: string): IContainmentResult => {
	if (!looksAbsolute(childAbs) || !looksAbsolute(parentAbs)) {
		return {
			contained: false,
			relative: '',
			reason: 'absolute-on-child',
		};
	}
	const platform = detectPlatform(childAbs, parentAbs);
	const rel = relativeForPlatform(platform, parentAbs, childAbs);
	if (rel === '' || rel === '.') {
		return {
			contained: false,
			relative: '',
			reason: 'child-equals-parent',
		};
	}
	if (rel.startsWith('..') || isAbsolute(rel)) {
		return {
			contained: false,
			relative: rel,
			reason: 'parent-escape',
		};
	}
	return {
		contained: true,
		relative: rel,
		reason: 'inside',
	};
};

/**
 * Boolean containment check. Returns true iff `childAbs` is strictly
 * inside `parentAbs` (the parent itself is not contained).
 */
export const isContained = (childAbs: string, parentAbs: string): boolean =>
	compute(childAbs, parentAbs).contained;

/**
 * Containment check with a structured reason. Preferred for
 * diagnostic surfaces (`state_health`, `state_repair`) where the
 * operator needs to know WHY a path was rejected, not just that it
 * was.
 */
export const isContainedWithReason = (
	childAbs: string,
	parentAbs: string,
): IContainmentResult => compute(childAbs, parentAbs);
