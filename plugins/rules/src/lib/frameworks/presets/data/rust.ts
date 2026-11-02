import type { IRulePreset } from '../../contracts';

/**
 * Rust (cargo/clippy) preset — DATA only.
 *
 * Single Responsibility: declare the config file contents and
 * the agent-facing bullets for Rust. No logic, no detection,
 * no commands — those live in `languages/rust/*` and
 * `dogmas/rust.dogma.ts` respectively. The `IRulePreset` shape
 * is the *composition* of 5 narrow contracts (Liskov): this
 * data object satisfies each one because it has the right
 * fields, not because it inherits from anything.
 *
 * The linter config below is a *baseline* `clippy.toml`; the
 * project's own `Cargo.toml [lints]` always layers on top via
 * the project-config-first priority order.
 */
export const RUST_PRESET: IRulePreset = {
	id: 'rust-clippy',
	framework: 'rust',
	language: 'rs',
	linter: 'clippy',
	linterConfigFile: 'rust-clippy.clippy.toml',
	linterConfigContent: `# Baseline clippy config (the project's own Cargo.toml [lints] wins).
# Cargo itself is the typecheck; clippy.toml only carries lint levels.
avoid-breaking-exported-api = false
`,
	conventions: [
		'Prefer `?` over `unwrap()` in library code.',
		'Use `#[must_use]` on fallible builders.',
		'Test by table: `Vec<(name, input, expected)>` + `assert_eq!`.',
		'Run `cargo clippy --workspace --all-targets -- -D warnings` before every commit.',
	],
	requiredLinterDeps: ['cargo'],
};
