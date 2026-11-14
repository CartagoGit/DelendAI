import { describe, expect, it } from 'vitest';

import {
	identityFetchEnv,
	identityPushEnv,
	pushAsIdentity,
} from '../../../../src/lib/services/land-identity-push.helper';
import { assembleTrain } from '../../../../src/lib/services/land-train-assembly.helper';

const MISSING = '/nonexistent-land-clone';

describe('the identity push', () => {
	it('[<20ms] refuses without a token, naming why', () => {
		expect(
			pushAsIdentity({
				cwd: MISSING,
				remote: 'origin',
				refspec: 'HEAD:refs/heads/x',
				token: '',
			}),
		).toContain('no identity token');
	});

	it('[<200ms] says what failed, forced or not', () => {
		for (const force of [true, false])
			expect(
				pushAsIdentity({
					cwd: MISSING,
					remote: 'origin',
					refspec: 'HEAD:refs/heads/x',
					token: 't',
					force,
				}),
			).toBeTruthy();
	});

	it('[<5ms] reads the forge as the identity only with a token', () => {
		expect(identityFetchEnv('')).toBeUndefined();
		expect(identityFetchEnv('t')).toEqual(identityPushEnv('t'));
	});
});

describe('assembling a train in a clone that is not there', () => {
	it('[<500ms] reports the failure and pushes nothing', () => {
		const built = assembleTrain({
			root: MISSING,
			remote: 'origin',
			tipSha: 'abc',
			ref: 'batch-1',
			members: [],
			derived: new Set(),
			regenerate: () => true,
		});
		expect(built.pushFailure).toBeTruthy();
	});
});
