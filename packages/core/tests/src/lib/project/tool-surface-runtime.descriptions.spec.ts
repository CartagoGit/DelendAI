/**
 * tool-surface-runtime.descriptions.spec.ts — the long description a
 * catalogue reads is the registration's, or its catalogue description
 * when its description is adapted to the project served.
 */
import { describe, expect, it } from 'vitest';

import { createToolSurfaceRuntime } from '@delendai/core/lib/project/tool-surface-runtime.service';

const handle = () => ({
	enabled: true,
	enable() {
		this.enabled = true;
	},
	disable() {
		this.enabled = false;
	},
});

describe('listToolDescriptions', () => {
	it('gives each bound tool its long description, or its catalogue description', () => {
		const runtime = createToolSurfaceRuntime({
			mode: 'native',
			bootstrapToolIds: [],
			routerToolId: 'router',
			descriptors: [
				{
					registrationId: 'plain',
					name: 'delendai_plain',
					toolId: 'plain',
				},
				{
					registrationId: 'adapted',
					name: 'delendai_adapted',
					toolId: 'adapted',
					catalogDescription: 'What it does in any project.',
				},
			],
			plugins: [],
		});
		runtime.bindRegisteredTool({
			registrationId: 'plain',
			name: 'delendai_plain',
			description: 'The long text.',
			handler: () => undefined,
			handle: handle(),
		});
		runtime.bindRegisteredTool({
			registrationId: 'adapted',
			name: 'delendai_adapted',
			description: 'Not used under this project.',
			handler: () => undefined,
			handle: handle(),
		});
		expect(runtime.listToolDescriptions()).toEqual([
			{ name: 'delendai_plain', description: 'The long text.' },
			{
				name: 'delendai_adapted',
				description: 'What it does in any project.',
			},
		]);
	});
});
