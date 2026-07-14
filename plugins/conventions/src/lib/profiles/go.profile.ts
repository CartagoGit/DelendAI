/**
 * go.profile.ts — Go file-convention profile (f00113 S4).
 *
 * Go-module-shaped: `*_test.go` tests, `main.go`/`cmd/` entries,
 * `internal/` packages, generated protobuf/codegen files, `vendor/`
 * skipped like `node_modules`. Ordered — first match wins.
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

export const GO_PROFILE: ILanguageProfile = {
	id: 'go',
	displayName: 'Go',
	fileExtensions: ['.go'],
	skipDirs: ['vendor'],
	rules: [
		rule('generated', (rel) => {
			const base = basenameOf(rel);
			return (
				base.endsWith('.pb.go') ||
				base.endsWith('_gen.go') ||
				base.startsWith('zz_generated')
			);
		}),
		rule('test', (rel) => basenameOf(rel).endsWith('_test.go')),
		rule('entry', (rel) => {
			return basenameOf(rel) === 'main.go' || hasPathSegment(rel, 'cmd');
		}),
		rule('internal', (rel) => hasPathSegment(rel, 'internal')),
		rule('module', () => true),
	],
};
