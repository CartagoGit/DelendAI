/**
 * `extensions/vscode/src/test/configuration-center-dev-page.spec.ts`
 * — behaviour coverage for the dev-preview page at
 * `../dev/pages/configuration-center.ts`.
 *
 * That page is a browser module: it reads `document`/`window`
 * globals, `fetch`es `/api/configuration-center` and mounts the
 * SAME `renderConfigurationCenter` html the real webview command
 * files use (that real renderer is used here too, unmocked, so the
 * hoist/mount regexes run against genuine markup).
 *
 * Vitest here runs with the default `node` environment (see
 * `extensions/vscode/vitest.config.ts`) — no jsdom/happy-dom
 * dependency exists anywhere in this repo; `apps/web/tests/ui/tabs-cross-fade.spec.ts`
 * and `apps/web/scripts/__tests__/plugin-tabs-controller.spec.ts`
 * establish the house convention of a tiny purpose-built DOM
 * stand-in instead.
 *
 * The stand-in below never force-casts a fake object through to
 * `Document` / `HTMLElement` / `Window` (an unsafe two-step cast,
 * banned by `lint:test-unsafe-casts`). Instead:
 *   - Fakes are installed via `Object.defineProperty(globalThis, …,
 *     { value })` — `PropertyDescriptor.value` is declared `any` by
 *     lib.dom's own types, so handing it a plain object needs no
 *     cast to satisfy the real interfaces (hundreds of members).
 *   - `document.createElement('div')` is called to obtain the `root`
 *     handed to `page.render(root, deps)`: TypeScript gives that
 *     call its normal ambient `HTMLElement` type for free, and the
 *     fake `createElement` is wired to literally return this test's
 *     own `FakeRoot` instance — so the SAME reference is both a
 *     type-correct `HTMLElement` for the call site and the fully
 *     typed `FakeRoot` this file asserts against, with no cast in
 *     either direction.
 */
import { afterEach, describe, expect, it } from 'vitest';

import type { IConfigurationCenterSource } from '@delendai/ui-extension/public';

import { createConfigurationCenterPage } from '../dev/pages/configuration-center';
import type { IPageDeps } from '../dev/pages/contract';
import { defaultLang } from '../i18n';

interface IHostLike {
	post(message: unknown): void;
}

class FakeNode {
	readonly tagName: string;
	textContent = '';
	readonly style: Record<string, string> = {};
	private readonly attributes = new Map<string, string>();
	private ownerList: FakeNode[] | undefined;

	constructor(tagName: string) {
		this.tagName = tagName.toUpperCase();
	}

	setAttribute(name: string, value: string): void {
		this.attributes.set(name, value);
	}

	hasAttribute(name: string): boolean {
		return this.attributes.has(name);
	}

	attachTo(list: FakeNode[]): void {
		this.ownerList = list;
		list.push(this);
	}

	remove(): void {
		if (this.ownerList === undefined) return;
		const index = this.ownerList.indexOf(this);
		if (index >= 0) this.ownerList.splice(index, 1);
		this.ownerList = undefined;
	}
}

class FakeHead {
	readonly styleElements: FakeNode[] = [];

	appendChild(el: FakeNode): void {
		el.attachTo(this.styleElements);
	}

	querySelectorAll(_selector: string): FakeNode[] {
		// The page only ever queries for its own hoisted marker
		// attribute — a real selector engine is not needed here.
		return this.styleElements.filter((el) =>
			el.hasAttribute('data-configuration-center-hoisted'),
		);
	}
}

class FakeRoot {
	innerHTML = '';
	readonly appendedScripts: FakeNode[] = [];
	readonly center = new FakeNode('div');

	querySelector(_selector: string): FakeNode {
		return this.center;
	}

	appendChild(el: FakeNode): void {
		this.appendedScripts.push(el);
	}
}

class FakeDocument {
	readonly head = new FakeHead();
	private readonly nextRoots: FakeRoot[];

	constructor(roots: readonly FakeRoot[]) {
		this.nextRoots = [...roots];
	}

	createElement(tagName: string): FakeNode | FakeRoot {
		if (tagName === 'div') {
			const next = this.nextRoots.shift();
			if (next !== undefined) return next;
		}
		return new FakeNode(tagName);
	}
}

class FakeWindow {
	readonly dispatched: MessageEvent[] = [];
	__DELENDAI_CONFIGURATION_HOST__: IHostLike | undefined;

	dispatchEvent(event: MessageEvent): boolean {
		this.dispatched.push(event);
		return true;
	}
}

interface IFakeResponse {
	readonly ok: boolean;
	readonly status: number;
	json(): Promise<unknown>;
}

interface IFetchCall {
	readonly url: string;
	readonly method: string | undefined;
	readonly body: string | undefined;
}

class FakeFetch {
	readonly calls: IFetchCall[] = [];
	private index = 0;
	private readonly responders: ReadonlyArray<() => IFakeResponse>;

	constructor(responders: ReadonlyArray<() => IFakeResponse>) {
		this.responders = responders;
	}

	readonly run = (
		input: string,
		init?: { readonly method?: string; readonly body?: string },
	): Promise<IFakeResponse> => {
		this.calls.push({ url: input, method: init?.method, body: init?.body });
		const responder =
			this.responders[Math.min(this.index, this.responders.length - 1)];
		this.index += 1;
		if (responder === undefined) {
			throw new Error('no fake fetch responder configured');
		}
		return Promise.resolve(responder());
	};
}

const jsonResponse = (status: number, body: unknown): IFakeResponse => ({
	ok: status >= 200 && status < 300,
	status,
	json: () => Promise.resolve(body),
});

const SOURCE: IConfigurationCenterSource = {
	document: {
		configFile: 'delendai.config.json',
		exists: true,
		digest: 'a'.repeat(64),
		value: {},
		redactions: 0,
	},
	configSchema: { type: 'object', properties: {} },
	plugins: [],
	artifacts: [],
	unavailableArtifactKinds: [],
};

const EXPECTED_DIGEST = 'a'.repeat(64);
const SAVED_DIGEST = 'b'.repeat(64);

/** Installs the document/window fakes and returns the SAME `FakeRoot`
 * instance both as the ambient-typed `HTMLElement` (for the call into
 * `page.render`) and as its concrete type (for assertions) — see the
 * file header for why no cast is needed for either. */
const setUpDom = (): {
	readonly root: HTMLElement;
	readonly rootFake: FakeRoot;
	readonly head: FakeHead;
	readonly win: FakeWindow;
} => {
	const rootFake = new FakeRoot();
	const fakeDocument = new FakeDocument([rootFake]);
	Object.defineProperty(globalThis, 'document', {
		configurable: true,
		value: fakeDocument,
	});
	const win = new FakeWindow();
	Object.defineProperty(globalThis, 'window', {
		configurable: true,
		value: win,
	});
	const root = document.createElement('div');
	return { root, rootFake, head: fakeDocument.head, win };
};

const setUpFetch = (
	responders: ReadonlyArray<() => IFakeResponse>,
): FakeFetch => {
	const fake = new FakeFetch(responders);
	Object.defineProperty(globalThis, 'fetch', {
		configurable: true,
		value: fake.run,
	});
	return fake;
};

const flushMicrotasks = async (): Promise<void> => {
	await Promise.resolve();
	await Promise.resolve();
	await Promise.resolve();
};

describe('configuration-center dev page', () => {
	afterEach(() => {
		Reflect.deleteProperty(globalThis, 'document');
		Reflect.deleteProperty(globalThis, 'window');
		Reflect.deleteProperty(globalThis, 'fetch');
	});

	const deps: IPageDeps = { status: null, lang: defaultLang };

	it('has the configuration page id/label', () => {
		const page = createConfigurationCenterPage();
		expect(page.id).toBe('configuration');
		expect(page.label).toBe('configuration');
	});

	it('fetches the source, mounts the rendered html and wires the host bridge', async () => {
		const { root, rootFake, head, win } = setUpDom();
		const fake = setUpFetch([() => jsonResponse(200, SOURCE)]);

		const page = createConfigurationCenterPage();
		await page.render(root, deps);

		expect(fake.calls).toEqual([
			{
				url: '/api/configuration-center',
				method: undefined,
				body: undefined,
			},
		]);
		expect(rootFake.innerHTML).toContain('delendai-config');
		expect(rootFake.innerHTML).not.toContain('<script');
		expect(rootFake.appendedScripts.length).toBeGreaterThan(0);
		expect(rootFake.center.style.height).toBe('100%');
		expect(win.__DELENDAI_CONFIGURATION_HOST__).toBeDefined();
		expect(head.styleElements).toHaveLength(1);
	});

	it('re-renders (re-fetching) on discardConfiguration and hoists exactly one style tag', async () => {
		const { root, head, win } = setUpDom();
		const fake = setUpFetch([
			() => jsonResponse(200, SOURCE),
			() => jsonResponse(200, SOURCE),
		]);

		const page = createConfigurationCenterPage();
		await page.render(root, deps);
		const secondRoot = new FakeRoot();
		Object.defineProperty(document, 'createElement', {
			configurable: true,
			value: (tagName: string) =>
				tagName === 'div' ? secondRoot : new FakeNode(tagName),
		});

		win.__DELENDAI_CONFIGURATION_HOST__?.post({
			command: 'discardConfiguration',
		});
		// The re-render is fired without being awaited by the page
		// itself (`void render()`); give its microtasks a tick.
		await flushMicrotasks();

		expect(fake.calls).toHaveLength(2);
		// The stale hoisted <style> was removed before the fresh one
		// was appended — never two at once.
		expect(head.styleElements).toHaveLength(1);
	});

	it('posts a save, maps a successful response to configurationSaved and dispatches it on window', async () => {
		const { root, win } = setUpDom();
		setUpFetch([
			() => jsonResponse(200, SOURCE),
			() =>
				jsonResponse(200, {
					ok: true,
					document: { digest: SAVED_DIGEST },
				}),
		]);

		const page = createConfigurationCenterPage();
		await page.render(root, deps);

		win.__DELENDAI_CONFIGURATION_HOST__?.post({
			command: 'saveConfiguration',
			expectedDigest: EXPECTED_DIGEST,
			edits: [],
		});
		await flushMicrotasks();

		expect(win.dispatched).toHaveLength(1);
		expect(win.dispatched[0]?.data).toEqual({
			command: 'configurationSaved',
			digest: SAVED_DIGEST,
		});
	});

	it('posts the digest and edits as the POST body', async () => {
		const { root, win } = setUpDom();
		const fake = setUpFetch([
			() => jsonResponse(200, SOURCE),
			() =>
				jsonResponse(200, {
					ok: true,
					document: { digest: SAVED_DIGEST },
				}),
		]);

		const page = createConfigurationCenterPage();
		await page.render(root, deps);
		win.__DELENDAI_CONFIGURATION_HOST__?.post({
			command: 'saveConfiguration',
			expectedDigest: EXPECTED_DIGEST,
			edits: [{ action: 'set', path: ['keepLegacy'], value: true }],
		});
		await flushMicrotasks();

		expect(fake.calls[1]).toEqual({
			url: '/api/configuration-center',
			method: 'POST',
			body: JSON.stringify({
				expectedDigest: EXPECTED_DIGEST,
				edits: [{ action: 'set', path: ['keepLegacy'], value: true }],
			}),
		});
	});

	it('maps a conflict response to configurationConflict', async () => {
		const { root, win } = setUpDom();
		setUpFetch([
			() => jsonResponse(200, SOURCE),
			() => jsonResponse(200, { ok: false, reason: 'conflict' }),
		]);

		const page = createConfigurationCenterPage();
		await page.render(root, deps);
		win.__DELENDAI_CONFIGURATION_HOST__?.post({
			command: 'saveConfiguration',
			expectedDigest: EXPECTED_DIGEST,
			edits: [],
		});
		await flushMicrotasks();

		expect(win.dispatched[0]?.data).toEqual({
			command: 'configurationConflict',
		});
	});

	it('maps a non-conflict failure to configurationInvalid', async () => {
		const { root, win } = setUpDom();
		setUpFetch([
			() => jsonResponse(200, SOURCE),
			() => jsonResponse(200, { ok: false, reason: 'validation' }),
		]);

		const page = createConfigurationCenterPage();
		await page.render(root, deps);
		win.__DELENDAI_CONFIGURATION_HOST__?.post({
			command: 'saveConfiguration',
			expectedDigest: EXPECTED_DIGEST,
			edits: [],
		});
		await flushMicrotasks();

		expect(win.dispatched[0]?.data).toEqual({
			command: 'configurationInvalid',
		});
	});

	it('dispatches configurationInvalid when the save POST itself rejects', async () => {
		const { root, win } = setUpDom();
		const fake = setUpFetch([() => jsonResponse(200, SOURCE)]);
		let saveCalls = 0;
		Object.defineProperty(globalThis, 'fetch', {
			configurable: true,
			value: (
				input: string,
				init?: { readonly method?: string },
			): Promise<IFakeResponse> => {
				if (init?.method === 'POST') {
					saveCalls += 1;
					return Promise.reject(new Error('offline'));
				}
				return fake.run(input, init);
			},
		});

		const page = createConfigurationCenterPage();
		await page.render(root, deps);
		win.__DELENDAI_CONFIGURATION_HOST__?.post({
			command: 'saveConfiguration',
			expectedDigest: EXPECTED_DIGEST,
			edits: [],
		});
		await flushMicrotasks();

		expect(saveCalls).toBe(1);
		expect(win.dispatched[0]?.data).toEqual({
			command: 'configurationInvalid',
		});
	});

	it('rejects when the initial fetch is not ok', async () => {
		const { root } = setUpDom();
		setUpFetch([() => jsonResponse(500, { message: 'server exploded' })]);

		const page = createConfigurationCenterPage();
		await expect(page.render(root, deps)).rejects.toThrow(
			'server exploded',
		);
	});
});
