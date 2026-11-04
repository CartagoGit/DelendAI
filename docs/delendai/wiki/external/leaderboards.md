# Model leaderboards & auto-pickers

**Class:** Data sources, not routers.

---

## Summary

These are the data sources a smart router *consumes* — they're not
routers themselves. They publish evaluations, benchmarks, and
rankings. A user manually reads them today; v2 of Option D could
ingest them as advisor priors.

## Artificial Analysis

<https://artificialanalysis.ai/> — tracks **542 models**. Independent
evaluation across 9 evals (GDPval-AA v2, τ³-Banking, Terminal-Bench
v2.1, SciCode, HLE, GPQA Diamond, CritPt, AA-Omniscience, AA-LCR).
Publishes **intelligence index**, **cost per task**, **time per
task**, **output tokens per task**, **coding agent index** (with 16
of 23 coding agents benchmarked). Has a *Data Playground* for custom
comparisons.

- **No public API documented** for downstream tools — consumption
  today is mostly visual / via CSV exports.
- New "Auto" model comparison tool at `/models/recommend` (mentioned
  but undocumented publicly).
- Coding-agent rankings: <https://artificialanalysis.ai/agents/coding-agents>

## LMArena (formerly lmsys Chatbot Arena)

Now <https://arena.ai/>. Human-preference Elo. ELO data dumps exist;
"Auto" mode on their site routes prompts to two random anonymous
models and lets humans vote.

## Aider polyglot benchmark

<https://aider.chat/docs/leaderboards/> — directly tests coding
capability per model. Useful input for `strengths: ["code-edit"]`.

## Other

- <https://livecodebench.github.io>
- <https://swebench.com>
- <https://huggingface.co/spaces/open-llm-leaderboard/open_llm_leaderboard>
  — largely dormant in 2026; "Running on CPU UPGRADE"; most frontier
  models are closed-source now.

## What we can borrow for Option D

- **Use leaderboard data as advisor-side "tier" priors, not as
  auto-routing truth.** At advisor decision time, look up the
  model's `ArtificialAnalysisIntelligenceIndex` and `cost_per_task`,
  and use those to initialize the scoring function's quality
  estimate. The roster's `costTier: 4` field is just a fallback
  for when the leaderboard feed is stale.
- **The 9 eval names from Artificial Analysis** are a more rigorous
  version of our `CapabilityTag` enum. Worth cross-referencing.
- **Aider's polyglot benchmark** is the closest thing to an
  objective "code-edit" capability signal. A `code-edit`-tagged
  model that scores low here is suspect.
