import type { ICommandSet, ICommandSetProvider } from '../../contracts';

/**
 * Cargo/Clippy command-set provider. `cargo check` is both the
 * linter's typecheck and the user's first line of defense; we
 * surface it as `typecheckCommand` so the `check_rules` output
 * schema stays semantically correct even when "typecheck" is
 * the same binary.
 *
 * Single Responsibility: emit the three Rust commands for one
 * area. No more, no less. The Rust adapter (`rust.adapter.ts`)
 * wires this into its `ILanguageAdapter.commands` slot.
 */
export const rustCommandSetProvider: ICommandSetProvider = {
	buildCommandSet(areaDir): ICommandSet {
		const target = areaDir === '' || areaDir === 'root' ? '.' : areaDir;
		return {
			checkCommand: `cargo clippy --manifest-path ${target}/Cargo.toml --workspace --all-targets -- -D warnings`,
			fixCommand: `cargo clippy --manifest-path ${target}/Cargo.toml --fix --allow-dirty --allow-staged`,
			typecheckCommand: `cargo check --manifest-path ${target}/Cargo.toml --workspace`,
		};
	},
};
