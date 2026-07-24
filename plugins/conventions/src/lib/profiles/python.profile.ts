/**
 * python.profile.ts — Python file-convention profile (f00113 S2).
 *
 * Encodes the language-native equivalents of the TS roles: `*.py`
 * modules, `__init__.py` package markers, `__main__.py` entries,
 * pytest-style tests, `scripts/`/`bin/` scripts, `migrations/` and
 * protobuf-generated modules. Ordered — first match wins.
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

export const PYTHON_PROFILE: ILanguageProfile = {
	id: 'python',
	displayName: 'Python',
	fileExtensions: ['.py'],
	skipDirs: ['__pycache__', '.venv', 'venv', '.tox', '.mypy_cache'],
	rules: [
		rule('generated', (rel) => {
			const base = basenameOf(rel);
			return base.endsWith('_pb2.py') || base.endsWith('_pb2_grpc.py');
		}),
		rule('package-marker', (rel) => basenameOf(rel) === '__init__.py'),
		rule('entry', (rel) => basenameOf(rel) === '__main__.py'),
		rule('test', (rel) => {
			const base = basenameOf(rel);
			return (
				base.startsWith('test_') ||
				base.endsWith('_test.py') ||
				base === 'conftest.py' ||
				hasPathSegment(rel, 'tests')
			);
		}),
		rule(
			'script',
			(rel) =>
				hasPathSegment(rel, 'scripts') || hasPathSegment(rel, 'bin'),
		),
		rule('migration', (rel) => hasPathSegment(rel, 'migrations')),
		rule('module', () => true),
	],
};
