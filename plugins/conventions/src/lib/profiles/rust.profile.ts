/**
 * rust.profile.ts — Rust file-convention profile (f00113 S3).
 *
 * Cargo-shaped: `main.rs`/`lib.rs` crate entries, `mod.rs` module
 * roots, `build.rs` build scripts, `tests/` integration tests,
 * `benches/`, `examples/`, generated protobuf/flatbuffers modules.
 * Ordered — first match wins.
 */
import {
	basenameOf,
	hasPathSegment,
	type ILanguageProfile,
	type ILanguageRoleRule,
} from './profile.contract';

const rule = (
	name: string,
	match: (rel: string) => boolean,
): ILanguageRoleRule => ({ name, match });

export const RUST_PROFILE: ILanguageProfile = {
	id: 'rust',
	displayName: 'Rust',
	fileExtensions: ['.rs'],
	skipDirs: ['target'],
	rules: [
		rule('generated', (rel) => {
			const base = basenameOf(rel);
			return base.endsWith('.pb.rs') || base.endsWith('_generated.rs');
		}),
		rule('build-script', (rel) => basenameOf(rel) === 'build.rs'),
		rule('module-root', (rel) => basenameOf(rel) === 'mod.rs'),
		rule('crate-entry', (rel) => {
			const base = basenameOf(rel);
			return base === 'main.rs' || base === 'lib.rs';
		}),
		rule('test', (rel) => {
			const base = basenameOf(rel);
			return (
				hasPathSegment(rel, 'tests') ||
				base === 'tests.rs' ||
				base.endsWith('_test.rs')
			);
		}),
		rule('bench', (rel) => hasPathSegment(rel, 'benches')),
		rule('example', (rel) => hasPathSegment(rel, 'examples')),
		rule('module', () => true),
	],
};
