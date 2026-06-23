/**
 * Single Responsibility: declare the 8 idiomatic-dimension tags a
 * dogma carries. Each tag is a *narrow* union (not a free-form
 * string), so the bullets / downstream consumers can rely on a
 * stable shape.
 *
 * Interface Segregation: each dimension is its own interface so a
 * future consumer that only cares about `ownership` (e.g. an
 * "ownership checker" tool) can depend on `IOwnershipDogma` and
 * nothing else.
 */
export type TOwnershipDogma =
	| 'borrow-checker'
	| 'gc'
	| 'manual'
	| 'raii'
	| 'arc'
	| 'n/a';

export type TErrorModelDogma =
	| 'result'
	| 'exceptions'
	| 'sum-types'
	| 'multi-return'
	| 'exit-code'
	| 'throw'
	| 'revert'
	| 'n/a';

export type TNullSafetyDogma =
	| 'option'
	| 'nullable-types'
	| 'no-null'
	| 'nil-pointer'
	| 'optional'
	| 'null'
	| 'n/a';

export type TNamingDogma =
	| 'snake_case'
	| 'camelCase'
	| 'PascalCase'
	| 'kebab-case'
	| 'lowerCamelCase'
	| 'mixed'
	| 'n/a';

export type TAsyncDogma =
	| 'promises'
	| 'async-await'
	| 'goroutines'
	| 'callbacks'
	| 'actors'
	| 'futures'
	| 'coroutines'
	| 'none'
	| 'n/a';

export type TVisibilityDogma =
	| 'pub/fn'
	| 'public'
	| 'export'
	| 'no-modifier'
	| 'n/a';

export type TImmutabilityDogma =
	| 'default-immutable'
	| 'default-mutable'
	| 'let-mut'
	| 'const-everywhere'
	| 'n/a';

export type TTestingDogma =
	| 'table-driven'
	| 'xunit'
	| 'jest-style'
	| 'spec'
	| 'property-based'
	| 'example-based'
	| 'quickcheck'
	| 'test-blocks'
	| 'n/a';

export interface IOwnershipDogma {
	readonly ownership: TOwnershipDogma;
}
export interface IErrorModelDogma {
	readonly errorModel: TErrorModelDogma;
}
export interface INullSafetyDogma {
	readonly nullSafety: TNullSafetyDogma;
}
export interface INamingStyleDogma {
	readonly naming: TNamingDogma;
}
export interface IAsyncModelDogma {
	readonly async: TAsyncDogma;
}
export interface IVisibilityDogma {
	readonly visibility: TVisibilityDogma;
}
export interface IImmutabilityDogma {
	readonly immutability: TImmutabilityDogma;
}
export interface ITestingDogma {
	readonly testing: TTestingDogma;
}
