import type { IDogmaAdapter } from '../contracts';

/**
 * Rust dogma (Rust 2024 edition).
 *
 * Single Responsibility: this file is the *only* place that
 * declares the idiomatic style of Rust. Every other module that
 * wants to know "how should I write Rust?" reads the
 * `IDogmaAdapter` resolved from `DogmaRegistry` — never this
 * file directly (Dependency Inversion).
 *
 * The 8 dimensions are populated with the values that match the
 * Rust 2024 edition + the most-upstream community conventions.
 * A future Rust 2027 edition would update this file; nothing
 * else.
 */
export const RUST_DOGMA: IDogmaAdapter = {
	language: 'rs',
	version: 'rust-2024',
	packageManager: 'cargo',
	ownership: 'borrow-checker',
	errorModel: 'result',
	nullSafety: 'option',
	naming: 'snake_case',
	async: 'none',
	visibility: 'pub/fn',
	immutability: 'let-mut',
	testing: 'table-driven',
	bullets: [
		'Prefer `?` over `unwrap()` in library code; reserve `unwrap()` for tests and prototypes.',
		'Use `#[must_use]` on fallible builders, getters, and `Result`-returning constructors.',
		'Never `clone()` to satisfy the borrow checker; refactor the function signature instead.',
		'Mark public APIs `pub`; favour `pub(crate)` over `pub` for items that are internal-but-cross-module.',
		'Default to immutable bindings; reach for `let mut` only when the value actually mutates.',
		'Prefer `&str` over `&String` and `&[T]` over `&Vec<T>` in function signatures.',
		'Test by table: build a `Vec<(name, input, expected)>` and iterate with `assert_eq!`.',
		'Run `cargo clippy --workspace --all-targets -- -D warnings` before every commit; clippy lint names are part of the API.',
	],
};
