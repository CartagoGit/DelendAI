---
id: f00782
title: "The offer of accounts speaks the person's language, reads like a guide, and names any model from the public catalogue"
kind: feat
status: in-progress
type: proposal
track: architecture
date: 2026-10-21
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
- **Status**: pending
- **Files**: `packages/cli/src/lib/cli-language.service.ts`, `packages/cli/src/contracts/constants/offer-messages.constant.ts`, `packages/cli/src/contracts/interfaces/offer-messages.interface.ts`, `packages/cli/src/commands/language.command.ts`, `packages/cli/src/commands/registry.ts`, `packages/cli/src/lib/parser.service.ts`, `packages/cli/src/index.ts`, `packages/cli/src/lib/init/init-prompts.service.ts`
- **Gate**: type
- acceptance:
  - "The CLI's language is `--lang`, else `DELENDAI_LANG`, else the person's saved choice (`delendai language <code>`, kept in their user configuration), else the system locale (`LC_ALL`, `LC_MESSAGES`, `LANG`, `LANGUAGE`). `C` and `POSIX` name no language; when nothing names one, an interactive offer asks once, in every language it speaks, and saves the answer; anything else speaks English."
  - "Every message of the offer (progress, questions, choices, summary) has English and Spanish text, and a language without its own falls back to English."

### S2 — A guide, not a log
- **Status**: pending
- **Files**: `packages/cli/src/lib/init/account-prompts.service.ts`, `packages/cli/src/lib/init/offer-card.service.ts`, `packages/cli/src/lib/init/offer-progress.service.ts`, `packages/cli/src/commands/accounts.command.ts`, `packages/cli/src/lib/init/init-accounts-offer.service.ts`, `packages/core/src/lib/plugins/account-offer-flow.service.ts`, `packages/core/src/lib/contracts/interfaces/account-offer.interface.ts`
- **Gate**: type
- acceptance:
  - "The offer opens with a header saying what it does and that it reads names only, never a key's value. The accounts ready to add are asked first, then the findings that need classifying. Each is a numbered card (`3/13`) saying what kind of finding it is, what it is, its models or variable, and then the question. Choices are numbered with a line of explanation each. The end is a summary table. Colour is used only at a colour terminal."

### S3 — Any model or provider, named by the public catalogue
- **Status**: pending
- **Files**: `packages/core/src/lib/shared/model-catalogue.service.ts`, `packages/core/src/lib/contracts/constants/model-catalogue.constant.ts`, `packages/core/src/lib/contracts/interfaces/account-finding.interface.ts`, `packages/core/src/lib/shared/account-sources.service.ts`
- **Gate**: type
- acceptance:
  - "The public catalogue is fetched once a day into the user cache (nothing about the person is sent); a failed fetch serves the stale copy or none, and `--no-catalogue` skips it."
  - "A variable the catalogue lists for a provider becomes a finding named after that provider, whatever its name pattern. A model seen in chats is named after its maker: the `maker/` prefix most aggregators list it under, matched by family for a model not listed yet. Both suggestions show in the question, and none is ever a gate."

## acceptance

- The CLI's language is `--lang`, else `DELENDAI_LANG`, else the person's saved choice (`delendai language <code>`, kept in their user configuration), else the system locale (`LC_ALL`, `LC_MESSAGES`, `LANG`, `LANGUAGE`). `C` and `POSIX` name no language; when nothing names one, an interactive offer asks once, in every language it speaks, and saves the answer; anything else speaks English.
- Every message of the offer (progress, questions, choices, summary) has English and Spanish text, and a language without its own falls back to English.
- The offer opens with a header saying what it does and that it reads names only, never a key's value. The accounts ready to add are asked first, then the findings that need classifying. Each is a numbered card (`3/13`) saying what kind of finding it is, what it is, its models or variable, and then the question. Choices are numbered with a line of explanation each. The end is a summary table. Colour is used only at a colour terminal.
- The public catalogue is fetched once a day into the user cache (nothing about the person is sent); a failed fetch serves the stale copy or none, and `--no-catalogue` skips it.
- A variable the catalogue lists for a provider becomes a finding named after that provider, whatever its name pattern. A model seen in chats is named after its maker: the `maker/` prefix most aggregators list it under, matched by family for a model not listed yet. Both suggestions show in the question, and none is ever a gate.
