import { definePlugin } from '@mcp-vertex/core/public';
import z from 'zod';

export * from './lib/config';
export * from './lib/http-client';
export * from './lib/redaction';
export * from './lib/limits';
export * from './lib/mutations';
export * from './lib/diagnostics';
export * from './lib/url-policy';

const OptionsSchema = z.object({});

export default definePlugin({
	name: 'remote-provider-core',
	version: '0.1.1',
	describe:
		'Shared remote-provider foundation for other plugins. No tools; provides validated config and an injectable HTTP client.',
	optionsSchema: OptionsSchema,
	register() {
		return {
			knowledge: [
				{
					id: 'remote-provider-core-overview',
					title: 'Remote provider core overview',
					body: [
						'# Remote provider core',
						'',
						'This package is a shared foundation for future GitHub and GitLab plugins.',
						'',
						'- It resolves provider configuration with explicit precedence.',
						'- It exposes an injectable HTTP client for hermetic tests.',
						'- It normalizes common remote-provider failures without depending on plugin-git.',
					].join('\n'),
				},
			],
		};
	},
});
