/**
 * unit-dependencies.interface.ts — what entering a unit did about its dependencies.
 */

export type IUnitDependencies =
	| { readonly status: 'present' }
	| { readonly status: 'installed'; readonly command: string }
	| { readonly status: 'skipped'; readonly reason: string }
	| {
			readonly status: 'failed';
			readonly command: string;
			readonly reason: string;
	  };
