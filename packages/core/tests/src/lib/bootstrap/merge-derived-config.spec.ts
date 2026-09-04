import { describe, expect, it } from 'vitest';

import { mergeDerivedConfig } from '@delendai/core/public';

describe('mergeDerivedConfig', () => {
	it('adds recommended defaults without replacing project choices', () => {
		const merged = mergeDerivedConfig(
			{
				cacheDir: '.cache/delendai',
				docsDir: 'docs/delendai',
				plugins: {
					search: { options: { roots: ['src'], maxResults: 20 } },
					git: { options: {} },
				},
			},
			{
				cacheDir: '.project-cache',
				plugins: {
					search: { enabled: false, options: { roots: ['app'] } },
					local: {
						path: './plugins/local.mjs',
						options: { mode: 'strict' },
					},
				},
			},
		);

		expect(merged.cacheDir).toBe('.project-cache');
		expect(merged.docsDir).toBe('docs/delendai');
		expect(merged.plugins).toEqual({
			search: {
				enabled: false,
				options: { roots: ['app'], maxResults: 20 },
			},
			git: { options: {} },
			local: { path: './plugins/local.mjs', options: { mode: 'strict' } },
		});
	});

	it('does not mutate either input and preserves opaque project settings', () => {
		const recommended = {
			plugins: { docs: { options: { roots: ['docs'] } } },
		};
		const project = {
			providers: [{ id: 'project-model' }],
			plugins: { docs: { options: { roots: ['handbook'] } } },
		};
		const merged = mergeDerivedConfig(recommended, project);

		expect(merged.providers).toEqual([{ id: 'project-model' }]);
		expect(recommended.plugins.docs.options.roots).toEqual(['docs']);
		expect(project.plugins.docs.options.roots).toEqual(['handbook']);
	});
});
