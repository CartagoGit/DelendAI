# LangChain / LlamaIndex routers

**Class:** Framework routers (mostly deprecated).

---

## Summary

LangChain's `MultiPromptChain` / `LLMRouterChain` / `RouterChain` /
`MultiRetrievalQAChain` are now in the **`langchain_classic` package
and explicitly deprecated**. The replacement path is **LangGraph**
(`langgraph-supervisor`, `langgraph-multi-agent`) — the new docs no
longer surface router chains.

LlamaIndex has a `RouterQueryEngine` (selector-based) and
`LLMSingleSelector` / `LLMMultiSelector`, but it's a **retrieval
router**, not a model router.

## Routing model

`LLMRouterChain` uses an LLM call to *literally read the prompt*
and pick one of N destination prompts — the routing decision is
itself an LLM call (expensive, slow, but flexible). Embedding-based
routers exist too. **Now considered legacy; the LLM-as-router pattern
has fallen out of favor due to cost + latency + unreliability.**

## Catalog freshness

N/A (model-agnostic).

## Subscription-only support

✅ whatever the LLM tool supports.

## Pricing

OSS.

## URLs

- `libs/langchain/langchain_classic/chains/router/multi_prompt.py`
  in <https://github.com/langchain-ai/langchain>
- <https://docs.langchain.com/oss/python/langchain/overview> (current
  docs — no router page)
- <https://github.com/run-llama/llama_index> (LlamaIndex router
  engines)

## What we can borrow for Option D

**Mostly: lessons from what didn't work.**

- **Don't put the LLM-as-router in the hot path.** LangChain's
  mistake was making every prompt trigger an LLM call before the
  real LLM call. That's 2× the latency and 2× the cost. Our
  `<prefix>_advise_routing` is **opt-in** — the agent calls it
  when it wants advice, not on every tool call.
- **Pre-compile routing decisions where possible.** The scoring
  function in Option D is deterministic and pure; it's the LLM
  call that's expensive. Make the LLM call **once per session**
  (via `sessionId` stickiness), not per request.
- **Selector-based routers (LlamaIndex)** — the embedding-based
  variant is interesting for v2: pre-compute embeddings of task
  descriptions and route by similarity. We don't adopt it in MVP.
