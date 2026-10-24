import { describe, expect, it } from 'vitest';

import { scanSecrets } from '../../../src/lib/secrets/scan-secrets';

// Fake but format-valid secrets (never real credentials).
const AWS = 'AKIAIOSFODNN7EXAMPLE'; // AKIA + 16 uppercase/alnum
const PRIV = '-----BEGIN RSA PRIVATE KEY-----';
const GH = 'ghp_0123456789abcdefghijklmnopqrstuvwxyz'; // ghp_ + 36
const OPENAI = 'sk-0123456789abcdefghijklmnopqrstuv'; // sk- + 32

describe('scanSecrets', () => {
	it('detects an AWS access key id (critical), redacted, with a line number', () => {
		const findings = scanSecrets([
			{ path: 'a.ts', content: `const x = 1;\nconst key = '${AWS}';` },
		]);
		const finding = findings.find((f) => f.ruleId === 'aws-access-key-id');
		expect(finding?.severity).toBe('critical');
		expect(finding?.location?.line).toBe(2);
		expect(finding?.message).not.toContain(AWS); // redacted
		expect(finding?.message).toContain('***');
	});

	it('detects private-key material, github and openai tokens', () => {
		const findings = scanSecrets([
			{ path: 'k', content: `${PRIV}\n${GH}\n${OPENAI}` },
		]);
		const ids = findings.map((f) => f.ruleId);
		expect(ids).toContain('private-key');
		expect(ids).toContain('github-token');
		expect(ids).toContain('openai-key');
	});

	it('has no false positives on ordinary code', () => {
		const findings = scanSecrets([
			{
				path: 'ok.ts',
				content:
					'const token = process.env.TOKEN;\nconst sk = "short";\nconst id = "AKIA";',
			},
		]);
		expect(findings).toEqual([]);
	});

	it('finds every occurrence, not just the first', () => {
		const findings = scanSecrets([
			{ path: 'multi', content: `${AWS} and again ${AWS}` },
		]);
		expect(
			findings.filter((f) => f.ruleId === 'aws-access-key-id'),
		).toHaveLength(2);
	});
});
