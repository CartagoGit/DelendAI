import { describe, expect, it } from 'vitest';

import type { IToolSurfaceDescriptor } from '../../../../src/lib/contracts/interfaces/tool-surface.interface';
import { extractSkillToolRefs } from '../../../../src/lib/skills/skill-catalog';
import {
	buildToolSkillIndex,
	withSkillReferences,
} from '../../../../src/lib/skills/tool-skill-index';

const descriptor = (name: string): IToolSurfaceDescriptor => ({
	registrationId: name,
	name,
	toolId: name,
});

describe('extractSkillToolRefs', () => {
	it('reads the plugin and the tools a frontmatter names', () => {
		const body =
			'---\nname: demo\nplugin: work\ntools: [\'delendai_work_enter\', "delendai_work_publish"]\n---\n\nBody\n';

		expect(extractSkillToolRefs(body)).toEqual({
			plugin: 'work',
			tools: ['delendai_work_enter', 'delendai_work_publish'],
		});
	});

	it('answers an empty list when the skill names nothing', () => {
		expect(extractSkillToolRefs('---\nname: demo\n---\n')).toEqual({
			tools: [],
		});
	});
});

describe('buildToolSkillIndex', () => {
	it('lists, for each tool, every skill that names it in id order', () => {
		const index = buildToolSkillIndex([
			{ id: 'b-skill', tools: ['t_one', 't_two'] },
			{ id: 'a-skill', tools: ['t_one'] },
			{ id: 'none' },
		]);

		expect(index.get('t_one')).toEqual(['a-skill', 'b-skill']);
		expect(index.get('t_two')).toEqual(['b-skill']);
		expect(index.has('t_three')).toBe(false);
	});
});

describe('withSkillReferences', () => {
	it('points a descriptor at the first skill naming it and leaves the rest', () => {
		const result = withSkillReferences(
			[descriptor('t_one'), descriptor('t_other')],
			[{ id: 'a-skill', appliesTo: [], tools: ['t_one'] }],
		);

		expect(result[0]?.skill).toBe('a-skill');
		expect(result[1]).toEqual(descriptor('t_other'));
	});

	it("prefers the skill the tool's own plugin leads over an earlier cross-cutting one", () => {
		const result = withSkillReferences(
			[
				{
					...descriptor('delendai_quality_run_quality'),
					pluginId: 'quality',
				},
			],
			[
				{
					id: 'a-cross-cutting',
					appliesTo: ['@delendai/skills-pack', '@delendai/quality'],
					tools: ['delendai_quality_run_quality'],
				},
				{
					id: 'quality-gates',
					appliesTo: ['@delendai/quality'],
					tools: ['delendai_quality_run_quality'],
				},
			],
		);
		expect(result[0]?.skill).toBe('quality-gates');
	});
});
