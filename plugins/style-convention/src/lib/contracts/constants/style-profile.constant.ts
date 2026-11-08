/**
 * The style architectures a project can declare for a scope. `legacy-global`
 * is a statement, not a smell: styles there are left as they are, and
 * nothing reports them as drift.
 */
export const STYLE_ARCHITECTURES = [
	'scss-bem',
	'css-modules',
	'tailwind',
	'legacy-global',
] as const;

/** The architecture of a project that declares none. */
export const DEFAULT_STYLE_ARCHITECTURE = 'scss-bem';

/** The file extensions read as stylesheets and as markup. */
export const STYLESHEET_EXTENSIONS: readonly string[] = ['.scss', '.css'];
export const MARKUP_EXTENSIONS: readonly string[] = ['.astro'];

/**
 * Directives of the utility framework, by the first major version that
 * accepts them and the first that no longer does. A directive outside
 * its range for the installed version is refused rather than emitted.
 */
export const UTILITY_DIRECTIVES: Readonly<
	Record<string, { readonly since?: number; readonly until?: number }>
> = {
	apply: {},
	layer: {},
	config: {},
	tailwind: { until: 4 },
	utility: { since: 4 },
	reference: { since: 4 },
	theme: { since: 4 },
	source: { since: 4 },
	variant: { since: 4 },
	plugin: { since: 4 },
};

/** The package whose installed version decides which directives exist. */
export const UTILITY_FRAMEWORK_PACKAGE = 'tailwindcss';
