/**
 * work-ref-scope.ts — the `{scope}` segment of a readable branch name,
 * rendered and parsed both ways (f00808 S9).
 *
 *   scope := proposals [ "-" slices ] [ "-G" n ]
 *   proposals := id ( "+" id )*            x01003, x01004+x01016
 *   slices := S ( "-" S | ( "+" S )+ )?    S2, S1-S3, S1+S4
 *
 * Only `-` and `+` join parts: `[ ]`, `~`, `..` and spaces are not valid
 * in a git ref. The slice `all` and the first generation are left out,
 * so a name says only what tells it apart.
 */
import type { IWorkRefScope } from '../contracts/interfaces/work-ref-scope.interface';

const ID = '[a-z][a-z0-9]*';
const SLICE = 'S[0-9]+[a-z]?';

/** One whole scope, its three parts captured. */
const SCOPE = new RegExp(
	`^(${ID}(?:\\+${ID})*)(?:-(${SLICE}(?:-${SLICE}|(?:\\+${SLICE})+)?))?(?:-G([0-9]+))?$`,
	'u',
);

/** Whether `slice` is one the scope grammar can carry. */
const sliceInGrammar = (slice: string): boolean =>
	new RegExp(`^${SLICE}(?:-${SLICE}|(?:\\+${SLICE})+)?$`, 'u').test(slice);

/** `x01003`, `x01003-S2`, `x01003-S1-S3`, `x01004+x01016-G2`. */
export const renderWorkRefScope = (scope: IWorkRefScope): string => {
	const proposal = scope.proposal
		.toLowerCase()
		.split('+')
		.map((id) => id.replaceAll(/[^a-z0-9]/gu, ''))
		.filter((id) => id.length > 0)
		.join('+');
	const slice =
		scope.slice === 'all' || scope.slice === ''
			? ''
			: sliceInGrammar(scope.slice)
				? `-${scope.slice}`
				: `-${scope.slice.replaceAll(/[^A-Za-z0-9+]/gu, '')}`;
	const generation =
		scope.generation > 1 ? `-G${String(scope.generation)}` : '';
	return `${proposal.length > 0 ? proposal : 'unnamed'}${slice}${generation}`;
};

/** The scope a segment names, or `undefined` when it is not one. */
export const parseWorkRefScope = (
	segment: string,
): IWorkRefScope | undefined => {
	const found = SCOPE.exec(segment);
	if (found === null) return undefined;
	return {
		proposal: found[1] ?? '',
		slice: found[2] ?? 'all',
		generation: found[3] === undefined ? 1 : Number(found[3]),
	};
};
