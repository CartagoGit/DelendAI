/**
 * Unit + drift-guard specs for the plugin's TypeScript profile (f00037
 * S3). The plugin owns its own copy of the rule set; the final
 * `describe` block is the parity guard that asserts it classifies a
 * representative path set identically to the canonical lint-side engine
 * in `tools/scripts/lint/file-conventions.ts` — so the two encodings
 * can never silently drift.
 */
import { describe, expect, it } from 'vitest';

import {
	classifyPath as toolsClassify,
	type Role as ToolsRole,
} from '../../../../../../tools/scripts/lint/file-conventions';
import {
	classifyPath,
	TYPESCRIPT_RULES,
} from '../../../../src/lib/services/typescript-profile.service';

describe('typescript-profile classifyPath', () => {
	it.each([
		['packages/core/src/lib/tools/foo.tool.ts', 'tool'],
		['packages/core/src/lib/services/bar.service.ts', 'service'],
		[
			'packages/core/src/lib/contracts/interfaces/x.interface.ts',
			'interface',
		],
		['x/contracts/constants/y.constant.ts', 'constant'],
		['x/foo.registry.ts', 'registry'],
		['x/foo.register.ts', 'register'],
		['x/foo.factory.ts', 'factory'],
		['x/foo.builder.ts', 'builder'],
		['x/src/generated/types.ts', 'generated'],
		['x/foo.generated.ts', 'generated'],
		['pkg/src/public/index.ts', 'barrel'],
		['pkg/src/index.ts', 'barrel'],
		['pkg/src/lib/random-helper.ts', 'other'],
	])('classifies %s as %s', (path, role) => {
		expect(classifyPath(path)).toBe(role);
	});

	it('returns "other" for empty or non-string input', () => {
		expect(classifyPath('')).toBe('other');
		// @ts-expect-error — defensive runtime guard, not a typed call site.
		expect(classifyPath(undefined)).toBe('other');
	});

	it('normalises Windows separators', () => {
		expect(classifyPath('pkg\\src\\lib\\tools\\a.tool.ts')).toBe('tool');
	});

	it('exposes a non-empty ordered rule chain', () => {
		expect(TYPESCRIPT_RULES.length).toBeGreaterThan(0);
		// `generated` must win over everything (first in the chain).
		expect(TYPESCRIPT_RULES[0]?.name).toBe('generated');
	});
});

describe('drift guard: plugin profile == lint-side engine', () => {
	const SAMPLE_PATHS = [
		'packages/core/src/lib/tools/overview.tool.ts',
		'packages/core/src/lib/services/metrics.service.ts',
		'packages/core/src/lib/contracts/interfaces/core.interface.ts',
		'packages/core/src/lib/contracts/constants/glossary.constant.ts',
		'plugins/issues/src/lib/github-client.ts',
		'plugins/issues/src/lib/tools/list-issues.tool.ts',
		'apps/web/src/i18n/index.ts',
		'packages/core/src/generated/tool-outputs.ts',
		'packages/core/src/public/index.ts',
		'tools/scripts/lint/file-conventions.ts',
		'pkg/x.registry.ts',
		'pkg/x.register.ts',
		'pkg/x.factory.ts',
		'pkg/x.builder.ts',
		'random/whatever.ts',
	];

	it.each(SAMPLE_PATHS)('agrees on %s', (path) => {
		// The lint engine's `Role` union is identical to the plugin's.
		expect(classifyPath(path)).toBe(toolsClassify(path) as ToolsRole);
	});
});
