/**
 * offer-progress.service.spec.ts — while clients are asked, a terminal
 * sees who is pending and for how long; elsewhere, plain lines.
 */
import { describe, expect, it } from 'vitest';

import { OFFER_MESSAGES } from '../../contracts/constants/offer-messages.constant';
import { offerProgress } from './offer-progress.service';

const stream = (isTTY: boolean) => {
	const written: string[] = [];
	return { written, isTTY, write: (text: string) => written.push(text) };
};

describe('offerProgress', () => {
	it('keeps a live line of pending clients at a terminal, and a line per answer', () => {
		const out = stream(true);
		const progress = offerProgress(out);
		progress.client({
			command: 'claude',
			label: 'Claude Code',
			phase: 'asking',
		});
		progress.client({ command: 'codex', label: 'Codex', phase: 'asking' });
		progress.client({
			command: 'claude',
			label: 'Claude Code',
			phase: 'answered',
			verdict: 'usable',
			ms: 900,
		});
		progress.client({
			command: 'gemini',
			label: 'Gemini',
			phase: 'answered',
			verdict: 'not-installed',
			ms: 40,
		});
		progress.stop();
		const text = out.written.join('');
		expect(text).toContain('asking claude, codex…');
		expect(text).toContain('✓ Claude Code: logged in 0.9 s');
		expect(text).not.toContain('Gemini');
		expect(out.written.at(-1)).toBe('\r\x1b[2K');
	});

	it('writes plain lines and no control characters without a terminal', () => {
		const out = stream(false);
		const progress = offerProgress(out);
		progress.step('clients');
		progress.client({ command: 'codex', label: 'Codex', phase: 'asking' });
		progress.client({
			command: 'codex',
			label: 'Codex',
			phase: 'answered',
			verdict: 'needs-login',
			ms: 220,
		});
		progress.stop();
		expect(out.written).toEqual([
			'  › Looking at the AI clients installed here and how each is logged in\n',
			'    · Codex: not logged in 0.2 s\n',
		]);
	});

	it('speaks the language it is given', () => {
		const out = stream(false);
		const progress = offerProgress(out, OFFER_MESSAGES.es);
		progress.step('names');
		progress.client({
			command: 'codex',
			label: 'Codex',
			phase: 'answered',
			verdict: 'needs-login',
			ms: 220,
		});
		const text = out.written.join('');
		expect(text).toContain(OFFER_MESSAGES.es.steps.names);
		expect(text).toContain(
			`Codex: ${OFFER_MESSAGES.es.verdicts['needs-login']}`,
		);
	});
});
