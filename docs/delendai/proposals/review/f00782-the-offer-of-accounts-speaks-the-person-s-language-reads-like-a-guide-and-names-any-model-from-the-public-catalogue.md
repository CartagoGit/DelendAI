---
id: f00782
title: "The offer of accounts speaks the person's language, reads like a guide, and names any model from the public catalogue"
kind: feat
status: review
type: proposal
track: architecture
date: 2026-10-21
last-transition-id: c3a189e8-bda8-4d9d-90b3-13b5cffaeeca
last-correlation-id: c3a189e8-bda8-4d9d-90b3-13b5cffaeeca
last-transition-from: in-progress
last-transition-at: 2026-10-21T14:13:51.078Z
shipped-in:
  - "a4186de0673e"
---

# f00782 — The offer of accounts speaks the person's language, reads like a guide, and names any model from the public catalogue

## goal

`delendai accounts offer` speaks the person's language (chosen once, or from the system), shows each finding as a numbered card with what was seen, what is asked and what each answer means, and names any credential variable or model through the public model catalogue (models.dev: providers, their key variables and their models), so a model or provider no one at delendai has heard of is recognised by name.

## why

The owner, 2026-10-21: '¿estás dando por hecho que cualquier persona va a tener estos mismos que yo tengo? debería identificar cualquier LLM, IA o modelo... y no entiendo nada en inglés de lo que me pide... ni es visualmente atractivo'.

- Language: the CLI resolves its language from `--lang` only, default `en`; the owner's system says `LANG=C.UTF-8`, which names no language, so every question came in English to a Spanish speaker. The CLI's Spanish translation covers one word of the help (`Uso:`).
- Look: questions were long single lines on stderr, findings were not numbered, nothing set what was found apart from what was asked.
- Recognition: f00781 finds credential variables by a name pattern and models by the maker their id opens with. That cannot say that `DASHSCOPE_API_KEY` is Alibaba's, that `GITHUB_TOKEN` can be GitHub Copilot's, or who `qwen3.8-max` comes from. The public catalogue models.dev, read on 2026-10-21, lists 232 providers, each with its key variables and models (minimax: `MINIMAX_API_KEY`; alibaba: `DASHSCOPE_API_KEY`; zhipuai: `ZHIPU_API_KEY`; xiaomi: `XIAOMI_API_KEY`; meta: `META_MODEL_API_KEY`; github-copilot: `GITHUB_TOKEN`).

## non-goals

- Sending anything about the person: the catalogue is fetched as a public file, cached for a day, and skipped offline or with `--no-catalogue`.
- Translating every CLI command; this covers the offer of accounts and the language choice.

## slices

- global_gate: type

### S1 — The person's language, chosen once
- **Status**: done
- **Files**: `packages/cli/src/lib/cli-language.service.ts`, `packages/cli/src/contracts/constants/offer-messages.constant.ts`, `packages/cli/src/contracts/interfaces/offer-messages.interface.ts`, `packages/cli/src/commands/language.command.ts`, `packages/cli/src/commands/registry.ts`, `packages/cli/src/lib/parser.service.ts`, `packages/cli/src/index.ts`, `packages/cli/src/lib/init/init-prompts.service.ts`
- **Gate**: type
- acceptance:
  - "The CLI's language is `--lang`, else `DELENDAI_LANG`, else the person's saved choice (`delendai language <code>`, kept in their user configuration), else the system locale (`LC_ALL`, `LC_MESSAGES`, `LANG`, `LANGUAGE`). `C` and `POSIX` name no language; when nothing names one, an interactive offer asks once, in every language it speaks, and saves the answer; anything else speaks English."
  - "Every message of the offer (progress, questions, choices, summary) has English and Spanish text, and a language without its own falls back to English."
- shipped-in: `a4186de0673e`
- review-state: done
- review-implementer: claude-opus-5-5
- review-reviewer: minimax-m3.1-flash-preview
- review-log: approved by minimax-m3.1-flash-preview — verified at a4186de0673e, validate exit 0, tests 32/32; acceptance 2/2: (1) The order is the order the criterion gives, in the code. The parser takes the flag first - `lang: tokens.lang ?? defaultLang ?? 'en'`, with `langUnset` set onl… (2) Every message of the offer has English and Spanish text, and a language without its own falls back to English. The messages are one typed shape - IOfferMessage… — Gate is `type`: `bun run typecheck` exits 0 in this worktree. Verified: --lang, then DELENDAI_LANG, then the saved choice in the person's own user configuration, then LC_ALL/LC_MESSAGES/LANG/LANGUAGE; C and POSIX name no language; an interactive command asks once, in every language the offer speaks, and saves the answer; anything else speaks English. Every message of the offer has English and Spanish text (both are complete IOfferMessages objects, so a missing message would not compile) and a language without its own falls back to English. The CLI specs pass 32/32 over the language, accounts, card, progress and prompt specs. Delivery: merge a4186de0673e (PR #1339), which carries the slice and its follow-up fix eec169d912.

### S2 — A guide, not a log
- **Status**: done
- **Files**: `packages/cli/src/lib/init/account-prompts.service.ts`, `packages/cli/src/lib/init/offer-card.service.ts`, `packages/cli/src/lib/init/offer-progress.service.ts`, `packages/cli/src/commands/accounts.command.ts`, `packages/cli/src/lib/init/init-accounts-offer.service.ts`, `packages/core/src/lib/plugins/account-offer-flow.service.ts`, `packages/core/src/lib/contracts/interfaces/account-offer.interface.ts`
- **Gate**: type
- acceptance:
  - "The offer opens with a header saying what it does and that it reads names only, never a key's value. The accounts ready to add are asked first, then the findings that need classifying. Each is a numbered card (`3/13`) saying what kind of finding it is, what it is, its models or variable, and then the question. Choices are numbered with a line of explanation each. The end is a summary table. Colour is used only at a colour terminal."
- shipped-in: `a4186de0673e`
- review-state: done
- review-implementer: claude-opus-5-5
- review-reviewer: minimax-m3.1-flash-preview
- review-log: approved by minimax-m3.1-flash-preview — verified at a4186de0673e, validate exit 0, tests 32/32; acceptance 1/1: (1) The offer opens with a header saying what it does and that it reads names only, never a key's value: offerHeader writes the title and the intro (packages/cli/s… — Gate is `type`: `bun run typecheck` exits 0 in this worktree. Verified: the header says what the offer does and that it reads names only; the accounts ready to add are asked first and the findings that need classifying after; each finding is a numbered card (3/13) with its kind, its subject, its models or variable and then the question; the choices are numbered with an explanation each (the payment labels carry theirs in both languages); the offer ends in a summary table; colour is off unless the stream is a colour terminal (NO_COLOR, FORCE_COLOR=0, isTTY). The CLI specs pass 32/32 over the card, progress, accounts and prompt specs. Delivery: merge a4186de0673e (PR #1339).

### S3 — Any model or provider, named by the public catalogue
- **Status**: done
- **Files**: `packages/core/src/lib/shared/model-catalogue.service.ts`, `packages/core/src/lib/contracts/constants/public-catalogues.constant.ts` (f00783 folded `model-catalogue.constant.ts` into it), `packages/core/src/lib/contracts/interfaces/account-finding.interface.ts`, `packages/core/src/lib/shared/account-sources.service.ts`
- **Gate**: type
- acceptance:
  - "The public catalogue is fetched once a day into the user cache (nothing about the person is sent); a failed fetch serves the stale copy or none, and `--no-catalogue` skips it."
  - "A variable the catalogue lists for a provider becomes a finding named after that provider, whatever its name pattern. A model seen in chats is named after its maker: the `maker/` prefix most aggregators list it under, matched by family for a model not listed yet. Both suggestions show in the question, and none is ever a gate."
- shipped-in: `a4186de0673e`
- review-state: done
- review-implementer: claude-opus-5-5
- review-reviewer: minimax-m3.1-flash-preview
- review-log: approved by minimax-m3.1-flash-preview — verified at a4186de0673e, validate exit 0, tests 37/37; acceptance 2/2: (1) The catalogue is fetched once a day into the user cache, nothing about the person is sent, a failed fetch serves the stale copy or none, and --no-catalogue ski… (2) Both suggestions are made from the catalogue and none of them is a gate. A variable the catalogue lists for a provider becomes a finding named after that provi… — Gate is `type`: `bun run typecheck` exits 0 in this worktree. Verified: the catalogue is cached in the user cache and, as delivered, re-fetched once a day (MODEL_CATALOGUE_MAX_AGE_MS = 24h at a4186de06), only the public file is fetched so nothing about the person is sent, a failed fetch serves the stale copy or none, and --no-catalogue skips it. The naming holds: a variable the catalogue lists for a provider is named after that provider whatever its name pattern (GITHUB_TOKEN -> GitHub Copilot), a model seen in chats is named after its maker (the maker prefix most aggregators agree on, the family for one not listed yet), and both suggestions show in the question as a default that is never a gate. The core specs pass 37/37 over the account-sources, model-catalogue and account-offers specs. One note for the queue: the daily window was later replaced by f00783's 10-minute conditional recheck - the source is asked again more often but only conditionally, so an unchanged catalogue still costs no download; the copy still lands in the user cache. Delivery: merge a4186de0673e (PR #1339).

## acceptance

- The CLI's language is `--lang`, else `DELENDAI_LANG`, else the person's saved choice (`delendai language <code>`, kept in their user configuration), else the system locale (`LC_ALL`, `LC_MESSAGES`, `LANG`, `LANGUAGE`). `C` and `POSIX` name no language; when nothing names one, an interactive offer asks once, in every language it speaks, and saves the answer; anything else speaks English.
- Every message of the offer (progress, questions, choices, summary) has English and Spanish text, and a language without its own falls back to English.
- The offer opens with a header saying what it does and that it reads names only, never a key's value. The accounts ready to add are asked first, then the findings that need classifying. Each is a numbered card (`3/13`) saying what kind of finding it is, what it is, its models or variable, and then the question. Choices are numbered with a line of explanation each. The end is a summary table. Colour is used only at a colour terminal.
- The public catalogue is fetched once a day into the user cache (nothing about the person is sent); a failed fetch serves the stale copy or none, and `--no-catalogue` skips it.
- A variable the catalogue lists for a provider becomes a finding named after that provider, whatever its name pattern. A model seen in chats is named after its maker: the `maker/` prefix most aggregators list it under, matched by family for a model not listed yet. Both suggestions show in the question, and none is ever a gate.
