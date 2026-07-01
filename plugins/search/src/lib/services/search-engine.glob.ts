/**
 * search-engine.glob.ts — Solid-SRP extraction (glob → RegExp).
 *
 * `globToRegExp` lives in its own module so the in-house walker, the
 * `.gitignore` parser (which reuses it for pattern matching), and
 * any future backend can share the exact same glob semantics.
 *
 * Supports `**` (any path span, including `/`), `*` (any run within a
 * path segment), `?` (one non-`/` char). Everything else is matched
 * literally.
 */
export const globToRegExp = (glob: string): RegExp => {
	let re = '';
	for (let i = 0; i < glob.length; i += 1) {
		const c = glob[i] as string;
		if (c === '*') {
			if (glob[i + 1] === '*') {
				if (glob[i + 2] === '/') {
					// `**/` = zero or more path segments (so `src/**/*.ts`
					// also matches `src/a.ts`).
					re += '(?:.*/)?';
					i += 2;
				} else {
					re += '.*';
					i += 1;
				}
			} else {
				re += '[^/]*';
			}
		} else if (c === '?') {
			re += '[^/]';
		} else if ('.+^()|[]{}$\\'.includes(c)) {
			re += `\\${c}`;
		} else {
			re += c;
		}
	}
	return new RegExp(`^${re}$`);
};
