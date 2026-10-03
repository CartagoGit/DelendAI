import { describe, expect, it } from 'vitest';

import { GO_PROFILE } from '../../../../src/lib/profiles/go.profile';
import { classifyWithProfile } from '../../../../src/lib/profiles/profile.contract';
import { PYTHON_PROFILE } from '../../../../src/lib/profiles/python.profile';
import { RUST_PROFILE } from '../../../../src/lib/profiles/rust.profile';

const classifyAll = (
	profile: typeof PYTHON_PROFILE,
	paths: readonly string[],
): Record<string, string> =>
	Object.fromEntries(paths.map((p) => [p, classifyWithProfile(profile, p)]));

describe('python profile (f00113 S2)', () => {
	it('classifies a representative package tree', () => {
		expect(
			classifyAll(PYTHON_PROFILE, [
				'src/mypkg/__init__.py',
				'src/mypkg/__main__.py',
				'src/mypkg/service.py',
				'tests/test_service.py',
				'src/mypkg/handlers_test.py',
				'tests/conftest.py',
				'scripts/deploy.py',
				'src/mypkg/migrations/0001_initial.py',
				'src/mypkg/api_pb2.py',
				'src/mypkg/api_pb2_grpc.py',
			]),
		).toEqual({
			'src/mypkg/__init__.py': 'package-marker',
			'src/mypkg/__main__.py': 'entry',
			'src/mypkg/service.py': 'module',
			'tests/test_service.py': 'test',
			'src/mypkg/handlers_test.py': 'test',
			'tests/conftest.py': 'test',
			'scripts/deploy.py': 'script',
			'src/mypkg/migrations/0001_initial.py': 'migration',
			'src/mypkg/api_pb2.py': 'generated',
			'src/mypkg/api_pb2_grpc.py': 'generated',
		});
	});

	it('declares .py and the python cache/venv skip dirs', () => {
		expect(PYTHON_PROFILE.fileExtensions).toEqual(['.py']);
		expect(PYTHON_PROFILE.skipDirs).toContain('__pycache__');
		expect(PYTHON_PROFILE.skipDirs).toContain('.venv');
	});
});

describe('rust profile (f00113 S3)', () => {
	it('classifies a representative cargo crate', () => {
		expect(
			classifyAll(RUST_PROFILE, [
				'src/main.rs',
				'src/lib.rs',
				'src/parser/mod.rs',
				'src/parser/expr.rs',
				'build.rs',
				'tests/integration.rs',
				'src/parser/expr_test.rs',
				'benches/parse_bench.rs',
				'examples/quickstart.rs',
				'src/proto/api.pb.rs',
				'src/schema_generated.rs',
			]),
		).toEqual({
			'src/main.rs': 'crate-entry',
			'src/lib.rs': 'crate-entry',
			'src/parser/mod.rs': 'module-root',
			'src/parser/expr.rs': 'module',
			'build.rs': 'build-script',
			'tests/integration.rs': 'test',
			'src/parser/expr_test.rs': 'test',
			'benches/parse_bench.rs': 'bench',
			'examples/quickstart.rs': 'example',
			'src/proto/api.pb.rs': 'generated',
			'src/schema_generated.rs': 'generated',
		});
	});

	it('skips target/ like node_modules', () => {
		expect(RUST_PROFILE.skipDirs).toContain('target');
	});
});

describe('go profile (f00113 S4)', () => {
	it('classifies a representative go module', () => {
		expect(
			classifyAll(GO_PROFILE, [
				'main.go',
				'cmd/server/root.go',
				'internal/auth/token.go',
				'pkg/client/client.go',
				'pkg/client/client_test.go',
				'api/v1/api.pb.go',
				'internal/codegen/types_gen.go',
				'internal/k8s/zz_generated.deepcopy.go',
			]),
		).toEqual({
			'main.go': 'entry',
			'cmd/server/root.go': 'entry',
			'internal/auth/token.go': 'internal',
			'pkg/client/client.go': 'module',
			'pkg/client/client_test.go': 'test',
			'api/v1/api.pb.go': 'generated',
			'internal/codegen/types_gen.go': 'generated',
			'internal/k8s/zz_generated.deepcopy.go': 'generated',
		});
	});

	it('skips vendor/ like node_modules', () => {
		expect(GO_PROFILE.skipDirs).toContain('vendor');
	});
});
