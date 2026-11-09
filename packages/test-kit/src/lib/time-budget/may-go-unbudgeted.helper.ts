/**
 * may-go-unbudgeted.helper.ts — which spec files a run may let hold tests
 * with no budget. It imports nothing, so the shared vitest config (loaded
 * without a bundler) and the lint can both read it.
 */
/**
 * Whether a spec file may hold tests with no budget: it is on the migration
 * list, or the change does not touch it. A budget is asked of the files a
 * change writes, so a test merged by an older branch cannot turn another
 * change red. With no change known (`undefined`), no file is let off.
 */
export const mayGoUnbudgeted = (
	path: string,
	listed: ReadonlySet<string>,
	changed: ReadonlySet<string> | undefined,
): boolean => listed.has(path) || (changed !== undefined && !changed.has(path));
