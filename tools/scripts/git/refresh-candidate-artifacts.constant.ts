/**
 * The generators re-run after a candidate is merged forward, in the
 * order they must run: the catalog first, because the quantitative
 * block counts what it renders.
 */
export const GENERATED_REFRESH_COMMANDS: readonly string[] = [
	'catalog:generate',
	'gen:quantitative',
];
