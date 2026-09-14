/** Types for `./publication-scope.script`. */

/** Why a path must never travel in a publication candidate. */
export interface IScopeViolation {
	readonly path: string;
	readonly code:
		| 'HOST_ABSOLUTE_PATH'
		| 'DEPENDENCY_TREE'
		| 'LOCAL_ARTIFACT'
		| 'VCS_INTERNALS';
	readonly reason: string;
}
