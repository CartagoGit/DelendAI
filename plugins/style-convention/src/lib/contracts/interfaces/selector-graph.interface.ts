import type z from 'zod';

import type { STYLE_ARCHITECTURES } from '../constants/style-profile.constant';
import type { styleOptionsSchema } from '../schemas/style-options.schema';

export type IStyleOptions = z.infer<typeof styleOptionsSchema>;
export type IStyleArchitecture = (typeof STYLE_ARCHITECTURES)[number];

/** One source file: a stylesheet, or markup that may carry its own styles. */
export interface IStyleSource {
	/** Relative to the workspace, with forward slashes. */
	readonly path: string;
	readonly text: string;
}

/** One selector: where it is defined and which surfaces use it. */
export interface ISelectorNode {
	readonly name: string;
	readonly definedIn: readonly string[];
	readonly usedBy: readonly string[];
}

export interface ISelectorGraph {
	readonly selectors: ReadonlyMap<string, ISelectorNode>;
	/** The selectors each file defines. */
	readonly definedBy: ReadonlyMap<string, readonly string[]>;
}

/** A surface that consumes a selector, and whether it is in another package. */
export interface ISelectorConsumer {
	readonly path: string;
	readonly package: string;
	readonly crossesBoundary: boolean;
}

export interface ISelectorImpact {
	readonly selector: string;
	readonly definedIn: readonly string[];
	readonly consumers: readonly ISelectorConsumer[];
	/** How many consumers live outside every package that defines it. */
	readonly crossBoundary: number;
}

/** The resolved profile: what the project declared, with defaults filled in. */
export interface IStyleProfile {
	readonly architecture: IStyleArchitecture;
	readonly overrides: readonly {
		readonly glob: string;
		readonly architecture: IStyleArchitecture;
	}[];
	readonly layers: readonly {
		readonly name: string;
		readonly glob: string;
		readonly prefixes: readonly string[];
	}[];
	readonly styleRoots: readonly string[];
	readonly markupRoots: readonly string[];
	readonly tokenFiles: readonly string[];
	readonly sharedPrefixes: readonly string[];
	readonly sharedAuthority: string;
}

/** A design token: a CSS custom property or an SCSS variable, and its value. */
export interface IDesignToken {
	readonly name: string;
	readonly value: string;
	readonly file: string;
}

export interface IStyleFinding {
	readonly kind:
		| 'foreign-selector'
		| 'forked-selector'
		| 'shared-owned'
		| 'literal-has-token'
		| 'unsupported-directive';
	readonly line: number;
	readonly message: string;
	/** What to do instead. */
	readonly remedy: string;
}
