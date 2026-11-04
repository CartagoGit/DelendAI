/** Markers of the block delendai manages inside a project's git hooks. */

export const GUARD_BLOCK_BEGIN =
	'# >>> delendai guard (managed by delendai; remove this block to stop enforcing the development policy) >>>';
export const GUARD_BLOCK_END = '# <<< delendai guard <<<';

/** Marks a hook file the guard created, so removing the guard removes it. */
export const GUARD_CREATED_FILE = '# delendai guard created this hook file.';
