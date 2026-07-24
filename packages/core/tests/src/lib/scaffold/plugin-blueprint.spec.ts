import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import {
	pluginDir,
	renderLicense,
	renderPackageJson,
	renderPluginBlueprint,
	renderReadme,
	renderSampleToolSpec,
	renderSampleToolTs,
	renderTsconfig,
	renderVitestConfig,
} from '../../../../src/lib/scaffold/plugin-blueprint';

const FIXTURE = {
	name: 'demo',
	description: 'demo plugin',
	sampleToolId: 'demo.echo',
} as const;

const here = dirname(fileURLToPath(import.meta.url));
const workspaceRoot = resolve(here, '../../../../../..');

describe('plugin blueprint scaffold', () => {
	it('renders nine deterministic files under plugins/<name>', () => {
		const files = renderPluginBlueprint(FIXTURE);

		expect(files).toHaveLength(9);
		expect(files.map(({ path }) => path)).toEqual([
			'plugins/demo/package.json',
			'plugins/demo/tsconfig.json',
			'plugins/demo/vitest.config.ts',
			'plugins/demo/README.md',
			'plugins/demo/LICENSE',
			'plugins/demo/src/index.ts',
			'plugins/demo/src/lib/tools/demo-echo.tool.ts',
			'plugins/demo/src/public/index.ts',
			'plugins/demo/tests/src/lib/tools/demo-echo.tool.spec.ts',
		]);
		for (const file of files) {
			expect(file.path.startsWith(`${pluginDir(FIXTURE.name)}/`)).toBe(
				true,
			);
			expect(file.content.trim().length).toBeGreaterThan(0);
		}
		for (const file of files.filter(
			({ path }) => !path.endsWith('/LICENSE'),
		)) {
			expect(file.content, file.path).toContain(FIXTURE.name);
		}
	});

	it('copies the project license text verbatim', () => {
		const projectLicense = readFileSync(
			resolve(workspaceRoot, 'LICENSE'),
			'utf8',
		);
		const rendered = renderPluginBlueprint(FIXTURE).find(({ path }) =>
			path.endsWith('/LICENSE'),
		);
		if (!rendered) throw new Error('missing rendered license');
		expect(renderLicense().content).toBe(projectLicense);
		expect(rendered.content).toBe(projectLicense);
	});

	it('brands package metadata for the plugin package', () => {
		const pkg = JSON.parse(renderPackageJson(FIXTURE).content) as {
			name: string;
			scripts: Record<string, string>;
		};
		expect(pkg.name).toBe('@mcp-vertex/demo');
		expect(pkg.scripts.test).toBe('vitest run');
		expect(pkg.scripts['check:i18n']).toContain('demo');
	});

	it('extends the shared monorepo tsconfig and vitest config', () => {
		const tsconfig = JSON.parse(renderTsconfig(FIXTURE).content) as {
			extends: string;
		};
		expect(tsconfig.extends).toBe('../../tsconfig.base.json');
		expect(renderVitestConfig(FIXTURE).content).toContain(
			'../../vitest.shared',
		);
		expect(renderVitestConfig(FIXTURE).content).toContain("name: 'demo'");
	});

	it('includes the description and wires the sample tool id through the scaffold', () => {
		expect(renderReadme(FIXTURE).content).toContain(FIXTURE.description);
		expect(renderSampleToolTs(FIXTURE).content).toContain(
			FIXTURE.sampleToolId,
		);
		expect(renderSampleToolSpec(FIXTURE).content).toContain(
			FIXTURE.sampleToolId,
		);
	});
});
