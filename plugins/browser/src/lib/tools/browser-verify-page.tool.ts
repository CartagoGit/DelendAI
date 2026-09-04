import z from 'zod';

import type { IToolRegistration } from '@delendai/core/public';
import { toolJson } from '@delendai/core/public';

import {
	PLAYWRIGHT_INSTALL_HINT,
	probePlaywright,
	type IBrowserDriver,
} from '../page';

export interface IBrowserVerifyPageToolOptions {
	readonly namespacePrefix: string;
	readonly driver?: IBrowserDriver;
	readonly probeTool?: () => Promise<{
		readonly unavailable?: boolean;
		readonly hint?: string;
	}>;
}

const FIXTURE_INPUT = z
	.object({
		html: z.string().optional(),
		stylesheet: z.string().optional(),
		nav: z.string().optional(),
	})
	.strict();

const VERIFY_PAGE_INPUT = z
	.object({
		url: z.string().min(1).max(2_048),
		fixture: FIXTURE_INPUT.optional(),
	})
	.strict();

const VERIFY_PAGE_OUTPUT = z
	.object({
		url: z.string(),
		ok: z.boolean(),
		checks: z.object({
			html: z.boolean(),
			stylesheet: z.boolean(),
			nav: z.boolean(),
		}),
		mode: z.enum(['real', 'fixture']),
		installHint: z.string().optional(),
	})
	.strict();

interface IRenderedPageChecks {
	readonly html: boolean;
	readonly stylesheet: boolean;
	readonly nav: boolean;
}

const normalizeHttpUrl = (input: string): string => {
	const parsed = new URL(input);
	if (
		(parsed.protocol !== 'http:' && parsed.protocol !== 'https:') ||
		parsed.username !== '' ||
		parsed.password !== ''
	) {
		throw new Error(
			'url must be an absolute HTTP(S) URL without embedded credentials',
		);
	}
	return parsed.toString();
};

const defaultProbeTool = async (): Promise<{
	readonly unavailable?: boolean;
	readonly hint?: string;
}> => {
	const result = await probePlaywright();
	return result.available
		? {}
		: {
				unavailable: true,
				hint: result.installHint,
			};
};

const probeDriver = async (
	options: IBrowserVerifyPageToolOptions,
): Promise<
	| { readonly available: true; readonly driver: IBrowserDriver }
	| { readonly available: false; readonly hint: string }
> => {
	if (options.driver !== undefined) {
		return { available: true, driver: options.driver };
	}
	const probe = await (options.probeTool ?? defaultProbeTool)();
	return {
		available: false,
		hint: probe.hint ?? PLAYWRIGHT_INSTALL_HINT,
	};
};

const checksFromFixture = (fixture: {
	readonly html?: string | undefined;
	readonly stylesheet?: string | undefined;
	readonly nav?: string | undefined;
}): IRenderedPageChecks => ({
	html: fixture.html?.includes('<html>') ?? false,
	stylesheet: fixture.stylesheet !== undefined,
	nav: fixture.nav !== undefined,
});

const checksFromRenderedHtml = (html: string): IRenderedPageChecks => ({
	html: html.includes('<html'),
	stylesheet:
		/<link\b[^>]*rel=("|')stylesheet\1/i.test(html) ||
		html.includes('<style'),
	nav: /<nav\b/i.test(html),
});

const openWithDriver = async (
	driver: IBrowserDriver,
	args: { url: string },
) => {
	if (driver.open !== undefined) {
		return driver.open({ url: args.url });
	}
	if (driver.navigate !== undefined) {
		return driver.navigate({ url: args.url });
	}
	throw new Error('Browser driver does not implement open or navigate');
};

const toOutput = (
	url: string,
	mode: 'real' | 'fixture',
	checks: IRenderedPageChecks,
	installHint?: string,
) =>
	toolJson({
		url,
		ok: checks.html && checks.stylesheet && checks.nav,
		checks,
		mode,
		...(installHint !== undefined ? { installHint } : {}),
	});

export const buildBrowserVerifyPageToolRegistrations = (
	options: IBrowserVerifyPageToolOptions,
): readonly IToolRegistration[] => [
	{
		id: 'browser_verify_page',
		tags: ['browser', 'page', 'dom', 'network', 'e2e'],
		effects: ['network'],
		summary:
			'Verify a rendered page has an html root, stylesheet, and nav.',
		register: async (server) => {
			server.registerTool(
				`${options.namespacePrefix}_browser_verify_page`,
				{
					description:
						'Verify a page renders a real document shell with html root, stylesheet, and nav. When fixture is supplied, verification runs fully in-memory. Missing Playwright returns ok=false with an install hint instead of crashing.',
					inputSchema: VERIFY_PAGE_INPUT,
					outputSchema: VERIFY_PAGE_OUTPUT,
				},
				async (args: {
					url: string;
					fixture?:
						| {
								html?: string | undefined;
								stylesheet?: string | undefined;
								nav?: string | undefined;
						  }
						| undefined;
				}) => {
					const url = normalizeHttpUrl(args.url);
					if (args.fixture !== undefined) {
						return toOutput(
							url,
							'fixture',
							checksFromFixture(args.fixture),
						);
					}

					const probed = await probeDriver(options);
					if (!probed.available) {
						return toOutput(
							url,
							'real',
							{ html: false, stylesheet: false, nav: false },
							probed.hint,
						);
					}

					const page = await openWithDriver(probed.driver, { url });
					return toOutput(
						page.url,
						'real',
						checksFromRenderedHtml(page.html),
					);
				},
			);
		},
	},
];
