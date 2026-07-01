#!/usr/bin/env bun
import { describe, expect, it } from 'vitest';

import {
	classifyPath,
	DEFAULT_TS_RULES,
	type IRoleRule,
	type Role,
} from '../../../../src/lib/contracts/file-conventions.contract';

describe('file-conventions.contract (f00057 S8)', async () => {
	it('exposes a non-empty ordered rule chain with `generated` first', async () => {
		expect(DEFAULT_TS_RULES.length).toBeGreaterThan(40);
		// `generated` is the most specific rule (wins over every other match);
		// it MUST be the first entry in the chain.
		expect(DEFAULT_TS_RULES[0]?.name).toBe('generated');
	});

	it('classifies each role from a representative path', async () => {
		// One path per non-`other` role so a regression in any rule
		// surfaces as a single named failure.
		const cases: ReadonlyArray<readonly [string, Role]> = [
			[
				'packages/core/src/lib/contracts/interfaces/x.interface.ts',
				'interface',
			],
			['x/contracts/constants/y.constant.ts', 'constant'],
			['x/src/generated/types.ts', 'generated'],
			['x/foo.generated.ts', 'generated'],
			['pkg/src/public/index.ts', 'barrel'],
			['pkg/src/index.ts', 'barrel'],
			['pkg/src/lib/tools/foo.ts', 'tool'],
			['x/foo.registry.ts', 'registry'],
			['x/foo.register.ts', 'register'],
			['x/foo.factory.ts', 'factory'],
			['x/foo.builder.ts', 'builder'],
			['pkg/x.spec.ts', 'test'],
			['pkg/foo.config.ts', 'config'],
			['pkg/src/scripts/build.ts', 'script'],
			['pkg/src/commands/init.ts', 'command'],
			['pkg/src/components/Foo.astro', 'component'],
			['pkg/src/pages/index.astro', 'page'],
			['pkg/src/i18n/ui.ts', 'i18n'],
			['pkg/src/data/users.ts', 'data'],
			['pkg/src/dev/dev.ts', 'dev'],
			['pkg/src/webviews/foo.ts', 'webview'],
			['pkg/src/services/foo.service.ts', 'service'],
			['pkg/src/lib/random-helper.ts', 'other'],
		];
		for (const [path, role] of cases) {
			expect(classifyPath(path)).toBe(role);
		}
	});

	it('returns "other" for empty / null / undefined (runtime guard)', async () => {
		expect(classifyPath('')).toBe('other');
		expect(classifyPath(undefined)).toBe('other');
		expect(classifyPath(null)).toBe('other');
	});

	it('normalises Windows separators on the same chain', async () => {
		expect(classifyPath('pkg\\src\\lib\\tools\\a.tool.ts')).toBe('tool');
	});

	it('InterfaceRule wins over TypeRule (contracts/interfaces > contracts)', async () => {
		// TypeRule is `hasSegment(rel, 'contracts')` which is generic.
		// The chain MUST place InterfaceRule before TypeRule so an
		// `interface.ts` under `contracts/interfaces/` is not stolen
		// by the generic `contracts` match.
		const ifaceIdx = DEFAULT_TS_RULES.findIndex(
			(r: IRoleRule) => r.name === 'interface',
		);
		const typeIdx = DEFAULT_TS_RULES.findIndex(
			(r: IRoleRule) => r.name === 'type',
		);
		expect(ifaceIdx).toBeGreaterThanOrEqual(0);
		expect(typeIdx).toBeGreaterThanOrEqual(0);
		expect(ifaceIdx).toBeLessThan(typeIdx);
	});

	it('ConstantRule wins over TypeRule (contracts/constants > contracts)', async () => {
		const constIdx = DEFAULT_TS_RULES.findIndex(
			(r: IRoleRule) => r.name === 'constant',
		);
		const typeIdx = DEFAULT_TS_RULES.findIndex(
			(r: IRoleRule) => r.name === 'type',
		);
		expect(constIdx).toBeGreaterThanOrEqual(0);
		expect(typeIdx).toBeGreaterThanOrEqual(0);
		expect(constIdx).toBeLessThan(typeIdx);
	});

	it('first matching rule wins (earlier overrides later)', async () => {
		// `pkg/src/lib/services/foo.service.ts` is BOTH `service` (suffix)
		// AND `lib/...` matches no other earlier rule. Service should win
		// because it is earlier than the implicit final rule.
		expect(classifyPath('pkg/src/lib/services/foo.service.ts')).toBe(
			'service',
		);
	});
});

describe('helper role (f00093)', async () => {
	it('exposes `helper` in the Role union', async () => {
		// Compile-time check + runtime guard: a value of `Role` can be
		// the literal `'helper'`. If the union regresses this throws.
		const role: Role = 'helper';
		expect(role).toBe('helper');
	});

	it('classifies lib/helpers/foo.helper.ts as `helper` (folder rule)', async () => {
		expect(
			classifyPath('packages/cli/src/lib/helpers/cli-command.helper.ts'),
		).toBe('helper');
	});

	it('classifies a nested helpers/x/foo.helper.ts as `helper` (folder rule wins at any depth)', async () => {
		expect(
			classifyPath('a/b/c/helpers/foo.helper.ts'),
		).toBe('helper');
	});

	it('classifies a bare foo.helper.ts (no folder) as `helper` (suffix rule)', async () => {
		expect(classifyPath('pkg/src/lib/foo.helper.ts')).toBe('helper');
	});

	it('does NOT steal service-shaped files (foo.service.ts stays `service`)', async () => {
		expect(classifyPath('pkg/src/lib/help.service.ts')).toBe('service');
	});

	it('HelperRule is ordered BEFORE ServiceRule in DEFAULT_TS_RULES (chain invariant)', async () => {
		const helperIdx = DEFAULT_TS_RULES.findIndex(
			(r: IRoleRule) => r.name === 'helper',
		);
		const serviceIdx = DEFAULT_TS_RULES.findIndex(
			(r: IRoleRule) => r.name === 'service',
		);
		expect(helperIdx).toBeGreaterThanOrEqual(0);
		expect(serviceIdx).toBeGreaterThanOrEqual(0);
		expect(helperIdx).toBeLessThan(serviceIdx);
	});
});
