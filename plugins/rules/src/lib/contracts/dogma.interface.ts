export type IOwnershipDogma =
	| 'borrow-checker'
	| 'gc'
	| 'manual'
	| 'raii'
	| 'arc'
	| 'n/a';
export type IErrorModelDogma =
	| 'result'
	| 'exceptions'
	| 'sum-types'
	| 'multi-return'
	| 'nil-or-err'
	| 'none'
	| 'n/a';
export type INullSafetyDogma =
	| 'option'
	| 'nullable-types'
	| 'no-null'
	| 'nil-pointer'
	| 'undefined'
	| 'null'
	| 'optional'
	| 'n/a';
export type INamingStyleDogma =
	| 'snake_case'
	| 'camelCase'
	| 'PascalCase'
	| 'kebab-case'
	| 'SCREAMING_SNAKE'
	| 'dot.case'
	| 'lowerCamelCase'
	| 'ATX'
	| 'mixed'
	| 'n/a';
export type IAsyncModelDogma =
	| 'promises'
	| 'async-await'
	| 'goroutines'
	| 'callbacks'
	| 'effects'
	| 'actors'
	| 'futures'
	| 'coroutines'
	| 'none'
	| 'n/a';
export type IVisibilityDogma =
	| 'pub/fn'
	| 'public'
	| 'export'
	| 'no-modifier'
	| 'module'
	| 'fn'
	| 'n/a';
export type IImmutabilityDogma =
	| 'default-immutable'
	| 'default-mutable'
	| 'const-everywhere'
	| 'let-mut'
	| 'n/a';
export type ITestingDogma =
	| 'table-driven'
	| 'xunit'
	| 'jest-style'
	| 'spec'
	| 'property-based'
	| 'example-based'
	| 'quickcheck'
	| 'n/a';
