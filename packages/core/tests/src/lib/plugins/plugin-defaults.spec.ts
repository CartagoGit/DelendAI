/**
 * What `init` is allowed to write into somebody else's config.
 *
 * A default that is written out stops being a default: it becomes the
 * adopter's own declaration, frozen at the version they ran `init`. This
 * repository has already paid for that once — a00063, where delendai's
 * monorepo roots were stamped into an Angular app and every search
 * scanned zero files.
 */
import { describe, expect, it } from 'vitest';

import {
	PLUGIN_DEFAULTS,
	resolvePluginOptions,
} from '../../../../src/lib/plugins/plugin-defaults';

describe('PLUGIN_DEFAULTS materialises nothing a plugin owns (x00613)', () => {
	it('does not stamp the agent name pool into an adopter config', () => {
		// 68 names, copied from the proposals plugin's own
		// DEFAULT_AGENT_NAME_POOL. The plugin falls back to it whenever
		// the option is absent, so the copy bought nothing and froze a
		// list that can no longer be added to.
		expect(resolvePluginOptions('proposals')).not.toHaveProperty(
			'namePool',
		);
	});

	it('stamps no path derived from OUR docs layout', () => {
		// `audit.auditDir` and `issues.scaffoldDir` are documented by their
		// own plugins as `<docsDir>/…`, computed from the host's resolved
		// docsDir. A literal here freezes a path computed for nobody.
		const stamped = JSON.stringify(PLUGIN_DEFAULTS);
		expect(stamped).not.toContain('docs/delendai');
		expect(stamped).not.toContain('docs/proposals');
	});

	it('still answers for a plugin that has genuine, project-neutral defaults', () => {
		// The point is not to empty the map: numbers that mean the same
		// thing in every project are exactly what a default is for.
		expect(resolvePluginOptions('memory')).toMatchObject({ bm25K1: 1.5 });
	});

	it('answers with an empty object for a plugin it does not list', () => {
		expect(resolvePluginOptions('not-a-plugin')).toStrictEqual({});
	});
});
