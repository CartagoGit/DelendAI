# CLI-OFFER01 — Payment question ignores q and continues asking about accounts

**id:** CLI-OFFER01

**title:** Payment question ignores q and continues asking about accounts

**severity:** P3

**status:** confirmed by actual prompt helpers with synthetic answers

**component:** CLI account offer

**snapshot:** 26b442f8fa1e73e9583be5044b5ca557b59c8919

**locations:** ["packages/cli/src/lib/init/account-prompts.service.ts:91-101", "packages/cli/src/lib/init/init-prompts.service.ts:204-225"]

**expected:** q or quit at any offer question stops later questions, preserving already completed answers as promised by x00931.

**actual:** Payment q becomes default skip, stopped remains false and the next account is asked; vendor q control sets stopped true and asks nothing further.

**reproduction:** Run evidence/completion-20261021/root/probe-payment-stop.ts.txt as .ts from scratch using Bun source conditions. Fake readline answers only, no account flow, personal files, discovery or provider.

**evidence:** ["evidence/completion-20261021/root/probe-payment-stop.log", "evidence/completion-20261021/root/probe-payment-stop.stderr.log"]

**impact:** User stop request is ignored at one question; unnecessary prompts continue. No real spend, overwritten answer or data loss demonstrated.

**rootCause:** classify uses generic askChoice for billing; it maps invalid/non-numeric q to skip and never sets the closure stopped flag.

**recommendation:** Use a stop-aware choice result and propagate stop through the shared prompt state, distinguishing skip from stopping the whole sequence.

**regressionTest:** q/quit at vendor,billing,add-account,automation and before-classification must stop subsequent prompts; skip/default controls must retain their separate meanings.

**confidence:** High for the actual prompt helper path; no terminal rendering or productive account writes claimed.

**relationship:** New latest-delta UX regression; directly contradicts x00931 any-question acceptance and affects x00932 shared flow.

**auditor:** gpt-6.1-sol

**host:** Codex

**date:** 2026-10-21

**findingKey:** gpt-6.1-sol/CLI-OFFER01

**resolution:** Deferred for consensus; no implementation

**details:** evidence/completion-20261021/payment-stop-finding.md

```ts
				rl,
				`How do you pay ${vendor} for it?`,
				PAYMENT_CHOICES,
				'skip',
			);
			return paid === 'skip'
				? undefined
				: classificationFromAnswer(finding, vendor, paid);
		},
	};
};
```
