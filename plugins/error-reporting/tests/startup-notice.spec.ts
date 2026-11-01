import { describe, expect, it } from 'vitest';

import {
	announceErrorReportingStartup,
	buildErrorReportingStartupNotice,
	ERROR_REPORTING_ENABLE_CONFIG,
} from '../src/lib/startup-notice.helper';

describe('buildErrorReportingStartupNotice', () => {
	it('tells an operator it is ON, where reports go, and how to turn it off', () => {
		// Reporting that is on by default is only legitimate if the person
		// it runs for is told in the same breath what leaves the machine
		// and which line to flip. A notice missing either half turns the
		// default into a trick.
		const notice = buildErrorReportingStartupNotice({
			enabled: true,
			targetRepo: 'CartagoGit/delendai',
		});
		const text = notice.lines.join('\n');
		expect(text).toContain('error-reporting is ON');
		expect(text).toContain('CartagoGit/delendai');
		expect(text).toContain(`${ERROR_REPORTING_ENABLE_CONFIG} = false`);
	});

	it('states the privacy contract in the notice itself, not behind a link', () => {
		const text = buildErrorReportingStartupNotice({
			enabled: true,
			targetRepo: 'CartagoGit/delendai',
		}).lines.join('\n');
		expect(text).toContain('never your code');
		expect(text).toContain('delendai-internal errors');
	});

	it('asks the operator to switch it on when it is OFF', () => {
		// A silent opt-out means nobody ever reconsiders; the ask is the
		// only thing that recovers debuggability for an adopter who
		// disabled it once and forgot.
		const text = buildErrorReportingStartupNotice({
			enabled: false,
			targetRepo: 'CartagoGit/delendai',
		}).lines.join('\n');
		expect(text).toContain('error-reporting is OFF');
		expect(text).toContain(`${ERROR_REPORTING_ENABLE_CONFIG} = true`);
		expect(text).toContain('never your code');
	});
});

describe('announceErrorReportingStartup', () => {
	it('writes every line through the injected writer', () => {
		const written: string[] = [];
		announceErrorReportingStartup(
			buildErrorReportingStartupNotice({
				enabled: true,
				targetRepo: 'CartagoGit/delendai',
			}),
			(line) => written.push(line),
		);
		expect(written).toHaveLength(3);
		expect(written[0]?.endsWith('\n')).toBe(true);
	});

	it('never throws when the writer does', () => {
		// A boot message must not be able to stop the server it describes.
		expect(() =>
			announceErrorReportingStartup(
				buildErrorReportingStartupNotice({
					enabled: false,
					targetRepo: 'CartagoGit/delendai',
				}),
				() => {
					throw new Error('stderr is closed');
				},
			),
		).not.toThrow();
	});
});
