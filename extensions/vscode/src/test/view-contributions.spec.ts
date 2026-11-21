/**
 * view-contributions.spec.ts
 *
 * Every `view == <id>` a menu is conditioned on must name a view the
 * manifest actually declares.
 *
 * This is not hypothetical. `delendai.tools` was referenced by ten menu
 * contributions — refresh, the agent catalogue, the auto-agent selector,
 * tool search, the provider dashboard and healthcheck, tool detail, and
 * plugin configuration and activation — while no such view existed. The
 * extension even registered a tree data provider for it, which VS Code
 * silently ignores for an undeclared id. The result was a view that
 * never appeared and nine commands that could never be reached from it,
 * with no error anywhere to say so.
 *
 * That silence is what makes it worth a test rather than a fix: nothing
 * about the running extension would ever have told us.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

interface IManifest {
	readonly contributes?: {
		readonly views?: Record<
			string,
			readonly { readonly id: string; readonly type?: string }[]
		>;
		readonly menus?: Record<
			string,
			readonly { readonly command?: string; readonly when?: string }[]
		>;
	};
}

const manifest = JSON.parse(
	readFileSync(join(__dirname, '..', '..', 'package.json'), 'utf8'),
) as IManifest;

const declaredViewIds = (): readonly string[] =>
	Object.values(manifest.contributes?.views ?? {}).flatMap((group) =>
		group.map((view) => view.id),
	);

/** Every `view == <id>` in a `when` clause, with where it came from. */
const viewReferences = (): readonly {
	readonly menu: string;
	readonly command: string;
	readonly viewId: string;
}[] => {
	const references: { menu: string; command: string; viewId: string }[] = [];
	for (const [menu, items] of Object.entries(
		manifest.contributes?.menus ?? {},
	)) {
		for (const item of items) {
			for (const match of (item.when ?? '').matchAll(
				/view\s*==\s*([A-Za-z0-9_.-]+)/gu,
			)) {
				references.push({
					menu,
					command: item.command ?? '<unnamed>',
					viewId: match[1] ?? '',
				});
			}
		}
	}
	return references;
};

describe('VS Code view contributions', () => {
	it('[<200ms] declares every view a menu condition names', () => {
		const declared = new Set(declaredViewIds());
		const dangling = viewReferences().filter(
			(reference) => !declared.has(reference.viewId),
		);

		expect(
			dangling.map(
				(reference) =>
					`${reference.menu}: ${reference.command} is gated on the undeclared view "${reference.viewId}"`,
			),
		).toEqual([]);
	});

	it('[<200ms] declares the Dashboard as the one view', () => {
		// Tools, proposals and memory are sections of the Dashboard, not
		// separate panels.
		expect(declaredViewIds()).toEqual(['delendai.dashboard']);
	});

	it('[<200ms] gives every declared view a unique id', () => {
		const ids = declaredViewIds();

		expect(new Set(ids).size).toBe(ids.length);
	});
});
