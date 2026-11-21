import { describe, expect, it } from 'vitest';

import { affectedPlugins, EVERY_PLUGIN } from './affected-plugins.helper';

const HARNESS = 'tools/verify.script.ts';

/** Core's loader, two plugins over it, a CLI nobody loads, and the harness. */
const REPO: Readonly<Record<string, string>> = {
	'packages/core/src/loader.ts': 'export const load = (): number => 1;\n',
	'packages/core/src/util.ts': 'export const util = (): number => 2;\n',
	'plugins/a/src/index.ts':
		"import { util } from '../../../packages/core/src/util';\nexport const a = util;\n",
	'plugins/a/manifest.json': '{}\n',
	'plugins/b/src/index.ts':
		"import { a } from '../../a/src/index';\nexport const b = a;\n",
	'plugins/c/src/index.ts': 'export const c = 3;\n',
	'plugins/c/src/index.spec.ts': "import { c } from './index';\n",
	'packages/cli/src/main.ts': 'export const main = 0;\n',
	[HARNESS]:
		"import { load } from '../packages/core/src/loader';\nexport const run = load;\n",
};

const plugins = (changed: readonly string[]) =>
	affectedPlugins(
		{
			files: Object.keys(REPO),
			changed,
			read: (file) => REPO[file] ?? '',
			paths: {},
		},
		HARNESS,
	);

describe('affectedPlugins', () => {
	it('names the plugins a change reaches, through the plugins that import it', () => {
		expect(plugins(['packages/core/src/util.ts'])).toEqual(['a', 'b']);
		expect(plugins(['plugins/c/src/index.ts'])).toEqual(['c']);
	});

	it('counts a plugin file no module imports by where it lives', () => {
		expect(plugins(['plugins/a/manifest.json'])).toEqual(['a']);
	});

	it('names none for a change no plugin and not the harness can load', () => {
		expect(plugins(['packages/cli/src/main.ts'])).toEqual([]);
		expect(plugins(['plugins/c/src/index.spec.ts'])).toEqual([]);
		expect(plugins(['README.md'])).toEqual([]);
	});

	it('asks for every plugin when the harness or a root manifest changes', () => {
		expect(plugins(['packages/core/src/loader.ts'])).toBe(EVERY_PLUGIN);
		expect(plugins([HARNESS])).toBe(EVERY_PLUGIN);
		expect(plugins(['bun.lock'])).toBe(EVERY_PLUGIN);
		expect(plugins(['tsconfig.base.json'])).toBe(EVERY_PLUGIN);
	});
});
