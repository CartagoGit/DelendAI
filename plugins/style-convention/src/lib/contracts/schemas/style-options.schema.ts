import z from 'zod';

import { STYLE_ARCHITECTURES } from '../constants/style-profile.constant';

const architecture = z.enum(STYLE_ARCHITECTURES);

/**
 * What a project declares about its styles. Everything is optional; a
 * project that names no stylesheet root gets no tool and no diagnostic.
 */
export const styleOptionsSchema = z
	.object({
		/** Directories of stylesheets, relative to the workspace. */
		styleRoots: z.array(z.string().min(1)).optional(),
		/** Directories of markup that uses them. */
		markupRoots: z.array(z.string().min(1)).optional(),
		/** The architecture in force where no override says otherwise. */
		architecture: architecture.optional(),
		/** Folders with another architecture; the last match wins. */
		overrides: z
			.array(z.object({ glob: z.string().min(1), architecture }).strict())
			.optional(),
		/** Who may define which selectors: a layer owns the prefixes it names. */
		layers: z
			.array(
				z
					.object({
						name: z.string().min(1),
						glob: z.string().min(1),
						prefixes: z.array(z.string().min(1)).optional(),
					})
					.strict(),
			)
			.optional(),
		/** Stylesheets that declare the design tokens (CSS/SCSS variables). */
		tokenFiles: z.array(z.string().min(1)).optional(),
		/**
		 * Class prefixes another gate owns (shared component classes): this
		 * plugin names that gate instead of deciding for them.
		 */
		sharedPrefixes: z.array(z.string().min(1)).optional(),
		/** What to call the gate that owns the shared prefixes. */
		sharedAuthority: z.string().min(1).optional(),
	})
	.strict();
