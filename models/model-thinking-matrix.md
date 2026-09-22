<!-- llm-orchestrator · created by Bogdan-Gabriel Torcescu · https://www.linkedin.com/in/bogdantorcescu/ · keep this credit when copying or deriving -->
# Model thinking matrix — AA v4.3.2 snapshot

Observed: 2026-09-22. Scores and weighted USD/task costs come from the Artificial Analysis Intelligence Index v4.3.2 snapshot, not live account tariffs or a guarantee of repository outcomes. [Overall leaderboard](https://artificialanalysis.ai/leaderboards/models).

This report compares measurements. It cannot automatically select a model, establish account availability, or replace security, payment, migration, concurrency, or compatibility review floors.

## Indices

Benchmark cost index: `100 × observed benchmark cost / $0.50`; GPT-5.6 Sol medium is the fixed 100 baseline. Token basket index: `100 × (input price + 0.25 × output price) / $9`, using a synthetic 1M uncached input + 250K output basket and Sol’s $4/$20 price as 100. The token basket is not a measured task cost.

## Per-model measurements and adjacent effort deltas

| Model | Display name | Effort | Score | USD/task | Benchmark cost index | Token basket index | Adjacent measured delta | Internal reading |
| --- | --- | --- | ---: | ---: | ---: | ---: | --- | --- |
| gpt-5-6-luna | GPT-5.6 Luna | low | 21 | $0.01 | 2 | 6 | — | First measured effort for this model; no internal effort comparison. |
| gpt-5-6-luna | GPT-5.6 Luna | medium | 25 | $0.02 | 4 | 6 | +$0.01 (2.00×); +4 score | Compare only with adjacent measured effort; higher effort raises observed cost. |
| gpt-5-6-luna | GPT-5.6 Luna | high | 32 | $0.04 | 8 | 6 | +$0.02 (2.00×); +7 score | Compare only with adjacent measured effort; higher effort raises observed cost. |
| gpt-5-6-luna | GPT-5.6 Luna | xhigh | 35 | $0.09 | 18 | 6 | +$0.05 (2.25×); +3 score | Compare only with adjacent measured effort; higher effort raises observed cost. |
| gpt-5-6-luna | GPT-5.6 Luna | max | 37 | $0.18 | 36 | 6 | +$0.09 (2.00×); +2 score | Compare only with adjacent measured effort; higher effort raises observed cost. |
| gpt-5-6-terra | GPT-5.6 Terra | low | 27 | $0.14 | 28 | 56 | — | First measured effort for this model; no internal effort comparison. |
| gpt-5-6-terra | GPT-5.6 Terra | medium | 30 | $0.18 | 36 | 56 | +$0.04 (1.29×); +3 score | Compare only with adjacent measured effort; higher effort raises observed cost. |
| gpt-5-6-terra | GPT-5.6 Terra | high | 34 | $0.34 | 68 | 56 | +$0.16 (1.89×); +4 score | Compare only with adjacent measured effort; higher effort raises observed cost. |
| gpt-5-6-terra | GPT-5.6 Terra | xhigh | 38 | $0.63 | 126 | 56 | +$0.29 (1.85×); +4 score | Compare only with adjacent measured effort; higher effort raises observed cost. |
| gpt-5-6-terra | GPT-5.6 Terra | max | 42 | $1.40 | 280 | 56 | +$0.77 (2.22×); +4 score | Compare only with adjacent measured effort; higher effort raises observed cost. |
| gpt-5-6-sol | GPT-5.6 Sol | low | 33 | $0.26 | 52 | 100 | — | First measured effort for this model; no internal effort comparison. |
| gpt-5-6-sol | GPT-5.6 Sol | medium | 39 | $0.50 | 100 | 100 | +$0.24 (1.92×); +6 score | Compare only with adjacent measured effort; higher effort raises observed cost. |
| gpt-5-6-sol | GPT-5.6 Sol | high | 42 | $0.81 | 162 | 100 | +$0.31 (1.62×); +3 score | Compare only with adjacent measured effort; higher effort raises observed cost. |
| gpt-5-6-sol | GPT-5.6 Sol | xhigh | 44 | $1.18 | 236 | 100 | +$0.37 (1.46×); +2 score | Compare only with adjacent measured effort; higher effort raises observed cost. |
| gpt-5-6-sol | GPT-5.6 Sol | max | 47 | $1.99 | 398 | 100 | +$0.81 (1.69×); +3 score | Compare only with adjacent measured effort; higher effort raises observed cost. |
| gpt-6-astra | GPT-6 Astra | low | 46 | $0.82 | 164 | 250 | — | First measured effort for this model; no internal effort comparison. |
| gpt-6-astra | GPT-6 Astra | medium | 50 | $1.54 | 308 | 250 | +$0.72 (1.88×); +4 score | Compare only with adjacent measured effort; higher effort raises observed cost. |
| gpt-6-astra | GPT-6 Astra | high | 51 | $1.73 | 346 | 250 | +$0.19 (1.12×); +1 score | Compare only with adjacent measured effort; higher effort raises observed cost. |
| gpt-6-astra | GPT-6 Astra | xhigh | 52 | $2.31 | 462 | 250 | +$0.58 (1.34×); +1 score | Compare only with adjacent measured effort; higher effort raises observed cost. |
| gpt-6-astra | GPT-6 Astra | max | 53 | $3.26 | 652 | 250 | +$0.95 (1.41×); +1 score | Compare only with adjacent measured effort; higher effort raises observed cost. |
| claude-sonnet-5 | Claude Sonnet 5 | low | 24 | $0.51 | 102 | 50 | — | First measured effort for this model; no internal effort comparison. |
| claude-sonnet-5 | Claude Sonnet 5 | medium | 28 | $1.00 | 200 | 50 | +$0.49 (1.96×); +4 score | Compare only with adjacent measured effort; higher effort raises observed cost. |
| claude-sonnet-5 | Claude Sonnet 5 | high | 32 | $1.79 | 358 | 50 | +$0.79 (1.79×); +4 score | Compare only with adjacent measured effort; higher effort raises observed cost. |
| claude-sonnet-5 | Claude Sonnet 5 | xhigh | 34 | $2.87 | 574 | 50 | +$1.08 (1.60×); +2 score | Compare only with adjacent measured effort; higher effort raises observed cost. |
| claude-sonnet-5 | Claude Sonnet 5 | max | 38 | $5.09 | 1018 | 50 | +$2.22 (1.77×); +4 score | Compare only with adjacent measured effort; higher effort raises observed cost. |
| claude-opus-5 | Claude Opus 5 | low | 39 | $1.10 | 220 | 125 | — | First measured effort for this model; no internal effort comparison. |
| claude-opus-5 | Claude Opus 5 | medium | 45 | $2.19 | 438 | 125 | +$1.09 (1.99×); +6 score | Compare only with adjacent measured effort; higher effort raises observed cost. |
| claude-opus-5 | Claude Opus 5 | high | 48 | $3.61 | 722 | 125 | +$1.42 (1.65×); +3 score | Compare only with adjacent measured effort; higher effort raises observed cost. |
| claude-opus-5 | Claude Opus 5 | xhigh | 50 | $4.88 | 976 | 125 | +$1.27 (1.35×); +2 score | Compare only with adjacent measured effort; higher effort raises observed cost. |
| claude-opus-5 | Claude Opus 5 | max | 51 | $5.86 | 1172 | 125 | +$0.98 (1.20×); +1 score | Compare only with adjacent measured effort; higher effort raises observed cost. |
| claude-opus-5-5 | Claude Opus 5.5 | max | 58 | $5.98 | 1196 | 100 | — | Segregate from standalone cross-model comparisons. |
| claude-fable-5-1 | Claude Fable 5.1 | low | 47 | $2.37 | 474 | 250 | — | Segregate from standalone cross-model comparisons. |
| claude-fable-5-1 | Claude Fable 5.1 | medium | 49 | $2.98 | 596 | 250 | +$0.61 (1.26×); +2 score | Segregate from standalone cross-model comparisons. |
| claude-fable-5-1 | Claude Fable 5.1 | high | 51 | $3.91 | 782 | 250 | +$0.93 (1.31×); +2 score | Segregate from standalone cross-model comparisons. |
| claude-fable-5-1 | Claude Fable 5.1 | xhigh | 53 | $5.98 | 1196 | 250 | +$2.07 (1.53×); +2 score | Segregate from standalone cross-model comparisons. |
| claude-fable-5-1 | Claude Fable 5.1 | max | 53 | $7.63 | 1526 | 250 | +$1.65 (1.28×); no measured gain at displayed precision | Segregate from standalone cross-model comparisons. |
| claude-fable-5 | Claude Fable 5 | low | — | — | — | 250 | — | Segregate from standalone cross-model comparisons. |
| claude-fable-5 | Claude Fable 5 | medium | — | — | — | 250 | — | Segregate from standalone cross-model comparisons. |
| claude-fable-5 | Claude Fable 5 | high | — | — | — | 250 | — | Segregate from standalone cross-model comparisons. |
| claude-fable-5 | Claude Fable 5 | xhigh | — | — | — | 250 | — | Segregate from standalone cross-model comparisons. |
| claude-fable-5 | Claude Fable 5 | max | 50 | $8.75 | 1750 | 250 | — | Segregate from standalone cross-model comparisons. |
| claude-4-5-haiku | Claude Haiku 4.5 | disabled | — | — | — | 25 | — | No complete current benchmark tuple; do not infer. |
| claude-4-5-haiku | Claude Haiku 4.5 | enabled | 17 | $0.21 | 42 | 25 | — | First measured effort for this model; no internal effort comparison. |
| muse-spark-1-3 | Muse Spark 1.3 | xhigh | 45 | $1.37 | 274 | 26 | — | First measured effort for this model; no internal effort comparison. |
| muse-spark-1-3 | Muse Spark 1.3 | max | 48 | $1.60 | 320 | 26 | +$0.23 (1.17×); +3 score | Compare only with adjacent measured effort; higher effort raises observed cost. |
| grok-4-7 | Grok 4.7 | low | — | — | — | 39 | — | No complete current benchmark tuple; do not infer. |
| grok-4-7 | Grok 4.7 | medium | — | — | — | 39 | — | No complete current benchmark tuple; do not infer. |
| grok-4-7 | Grok 4.7 | high | 46 | $2.73 | 546 | 39 | — | First measured effort for this model; no internal effort comparison. |
| grok-4-7 | Grok 4.7 | xhigh | 46 | $3.74 | 748 | 39 | +$1.01 (1.37×); no measured gain at displayed precision | No measured score gain at displayed precision; retain lower-cost prior level unless another need is evidenced. |
| grok-4-6 | Grok 4.6 | low | 35 | $0.48 | 96 | 39 | — | First measured effort for this model; no internal effort comparison. |
| grok-4-6 | Grok 4.6 | medium | 43 | $1.50 | 300 | 39 | +$1.02 (3.13×); +8 score | Compare only with adjacent measured effort; higher effort raises observed cost. |
| grok-4-6 | Grok 4.6 | high | 44 | $1.86 | 372 | 39 | +$0.36 (1.24×); +1 score | Compare only with adjacent measured effort; higher effort raises observed cost. |
| grok-4-6 | Grok 4.6 | xhigh | 44 | $2.32 | 464 | 39 | +$0.46 (1.25×); no measured gain at displayed precision | No measured score gain at displayed precision; retain lower-cost prior level unless another need is evidenced. |
| mimo-v2-6-pro | MiMo V2.6 Pro | default | 46 | $0.13 | 26 | 7 | — | First measured effort for this model; no internal effort comparison. |
| qwen3-8-max | Qwen3.8 Max | default | 45 | $5.41 | 1082 | 39 | — | First measured effort for this model; no internal effort comparison. |
| glm-5-3 | GLM 5.3 | max | 45 | $2.01 | 402 | 28 | — | First measured effort for this model; no internal effort comparison. |
| glm-5-3-flash | GLM 5.3 Flash | default | 42 | $0.25 | 50 | 3 | — | First measured effort for this model; no internal effort comparison. |
| step-5 | Step 5 | default | 44 | $0.72 | 144 | 19 | — | First measured effort for this model; no internal effort comparison. |
| kimi-k3 | Kimi K3 | low | — | — | — | 75 | — | No complete current benchmark tuple; do not infer. |
| kimi-k3 | Kimi K3 | max | 44 | $2.00 | 400 | 75 | — | First measured effort for this model; no internal effort comparison. |
| gemini-3-8-flash | Gemini 3.8 Flash | low | 33 | — | — | 19 | — | No complete current benchmark tuple; do not infer. |
| gemini-3-8-flash | Gemini 3.8 Flash | medium | 40 | $0.93 | 186 | 19 | — | First measured effort for this model; no internal effort comparison. |
| gemini-3-8-flash | Gemini 3.8 Flash | high | 41 | $1.24 | 248 | 19 | +$0.31 (1.33×); +1 score | Compare only with adjacent measured effort; higher effort raises observed cost. |
| deepseek-v4-1-flash | DeepSeek V4.1 Flash | max | 39 | $0.27 | 54 | 7 | — | First measured effort for this model; no internal effort comparison. |
| minimax-m3 | MiniMax M3 | default | 29 | $0.51 | 102 | 7 | — | First measured effort for this model; no internal effort comparison. |

## Raw token prices

| Model family | Input USD/MTok | Output USD/MTok | Price note |
| --- | ---: | ---: | --- |
| GPT-5.6 Luna | $0.200 | $1.200 | AA-observed price; not a live account tariff. |
| GPT-5.6 Terra | $2.000 | $12.000 | AA-observed price; not a live account tariff. |
| GPT-5.6 Sol | $4.000 | $20.000 | AA-observed price; not a live account tariff. |
| GPT-6 Astra | $10.000 | $50.000 | AA-observed price; not a live account tariff. |
| Claude Sonnet 5 | $2.000 | $10.000 | AA-observed price; not a live account tariff. |
| Claude Opus 5 | $5.000 | $25.000 | AA-observed price; not a live account tariff. |
| Claude Opus 5.5 | $4.000 | $20.000 | AA-observed price; not a live account tariff. |
| Claude Fable 5.1 | $10.000 | $50.000 | AA-observed price; not a live account tariff. |
| Claude Fable 5 | $10.000 | $50.000 | AA-observed price; not a live account tariff. |
| Claude Haiku 4.5 | $1.000 | $5.000 | AA-observed price; not a live account tariff. |
| Muse Spark 1.3 | $1.250 | $4.250 | AA-observed price; not a live account tariff. |
| Grok 4.7 | $2.000 | $6.000 | $2/$6 below 200K input; $4/$12 above 200K. |
| Grok 4.6 | $2.000 | $6.000 | AA-observed price; not a live account tariff. |
| MiMo V2.6 Pro | $0.435 | $0.870 | AA-observed price; not a live account tariff. |
| Qwen3.8 Max | $2.000 | $6.000 | AA-observed price; not a live account tariff. |
| GLM 5.3 | $1.400 | $4.400 | AA-observed price; not a live account tariff. |
| GLM 5.3 Flash | $0.150 | $0.500 | AA-observed price; not a live account tariff. |
| Step 5 | $1.000 | $2.700 | AA-observed price; not a live account tariff. |
| Kimi K3 | $3.000 | $15.000 | AA-observed price; not a live account tariff. |
| Gemini 3.8 Flash | $0.750 | $3.750 | AA-observed price; not a live account tariff. |
| DeepSeek V4.1 Flash | $0.300 | $1.200 | AA-observed price; not a live account tariff. |
| MiniMax M3 | $0.300 | $1.200 | AA-observed price; not a live account tariff. |

## Availability and API identity

| Model family | Canonical API ID | Availability evidence |
| --- | --- | --- |
| GPT-5.6 Luna | `gpt-5.6-luna` | Canonical ID recorded in this dataset; exposure in a specific harness remains unverified. |
| GPT-5.6 Terra | `gpt-5.6-terra` | Canonical ID recorded in this dataset; exposure in a specific harness remains unverified. |
| GPT-5.6 Sol | `gpt-5.6-sol` | Canonical ID recorded in this dataset; exposure in a specific harness remains unverified. |
| GPT-6 Astra | `gpt-6-astra` | Canonical ID recorded in this dataset; exposure in a specific harness remains unverified. |
| Claude Sonnet 5 | `claude-sonnet-5` | Canonical ID recorded in this dataset; exposure in a specific harness remains unverified. |
| Claude Opus 5 | `claude-opus-5` | Canonical ID recorded in this dataset; exposure in a specific harness remains unverified. |
| Claude Opus 5.5 | `claude-opus-5-5` | Canonical ID recorded in this dataset; exposure in a specific harness remains unverified. |
| Claude Fable 5.1 | `claude-fable-5-1` | Canonical ID recorded in this dataset; exposure in a specific harness remains unverified. |
| Claude Fable 5 | `claude-fable-5` | Canonical ID recorded in this dataset; exposure in a specific harness remains unverified. |
| Claude Haiku 4.5 | `claude-haiku-4-5` | Canonical ID recorded in this dataset; exposure in a specific harness remains unverified. |
| Muse Spark 1.3 | — | Unknown API ID: discovery must use an explicit mapping; do not guess from the display name. |
| Grok 4.7 | `grok-4.7` | Canonical ID recorded in this dataset; exposure in a specific harness remains unverified. |
| Grok 4.6 | — | Unknown API ID: discovery must use an explicit mapping; do not guess from the display name. |
| MiMo V2.6 Pro | `mimo-v2.6-pro` | Canonical ID recorded in this dataset; exposure in a specific harness remains unverified. |
| Qwen3.8 Max | — | Unknown API ID: discovery must use an explicit mapping; do not guess from the display name. |
| GLM 5.3 | — | Unknown API ID: discovery must use an explicit mapping; do not guess from the display name. |
| GLM 5.3 Flash | — | Unknown API ID: discovery must use an explicit mapping; do not guess from the display name. |
| Step 5 | — | Unknown API ID: discovery must use an explicit mapping; do not guess from the display name. |
| Kimi K3 | — | Unknown API ID: discovery must use an explicit mapping; do not guess from the display name. |
| Gemini 3.8 Flash | — | Unknown API ID: discovery must use an explicit mapping; do not guess from the display name. |
| DeepSeek V4.1 Flash | — | Unknown API ID: discovery must use an explicit mapping; do not guess from the display name. |
| MiniMax M3 | — | Unknown API ID: discovery must use an explicit mapping; do not guess from the display name. |

## Source and interpretation limits

- [GPT-5.6 Luna](https://artificialanalysis.ai/models/gpt-5-6-luna)
- [GPT-5.6 Terra](https://artificialanalysis.ai/models/gpt-5-6-terra)
- [GPT-5.6 Sol](https://artificialanalysis.ai/models/gpt-5-6-sol)
- [GPT-6 Astra](https://artificialanalysis.ai/models/gpt-6-astra)
- [Claude Sonnet 5](https://artificialanalysis.ai/models/claude-sonnet-5)
- [Claude Opus 5](https://artificialanalysis.ai/models/claude-opus-5)
- [Claude Opus 5.5](https://artificialanalysis.ai/models/claude-opus-5-5) — Only the max-effort configuration is published (Adaptive Reasoning, Max Effort, Default Fallback); low–xhigh are not measured. The score includes the benchmark default fallback.
- [Claude Fable 5.1](https://artificialanalysis.ai/models/claude-fable-5-1) — All displayed scores include the benchmark default fallback and are not standalone scores.
- [Claude Fable 5](https://artificialanalysis.ai/models/claude-fable-5) — AA v4.3.2 max result uses Opus 4.8 default fallback. This legacy catalog model is not in the current leaderboard filter; segregate it from standalone cross-model comparisons.
- [Claude Haiku 4.5](https://artificialanalysis.ai/models/claude-4-5-haiku) — Its API thinking budget is not an effort enum. The disabled score 15 is incomplete and intentionally excluded.
- [Muse Spark 1.3](https://artificialanalysis.ai/models/muse-spark-1-3)
- [Grok 4.7](https://artificialanalysis.ai/models/grok-4-7) — $2/$6 below 200K input; $4/$12 above 200K. API identity source: https://docs.x.ai/developers/release-notes
- [Grok 4.6](https://artificialanalysis.ai/models/grok-4-6)
- [MiMo V2.6 Pro](https://artificialanalysis.ai/models/mimo-v2-6-pro) — API identity source: https://mimo.mi.com/docs/en-US/quick-start/usage-guide/text-generation/batch-api Price source: https://mimo.mi.com/docs/en-US/quick-start/usage-guide/text-generation/batch-api
- [Qwen3.8 Max](https://artificialanalysis.ai/models/qwen3-8-max)
- [GLM 5.3](https://artificialanalysis.ai/models/glm-5-3)
- [GLM 5.3 Flash](https://artificialanalysis.ai/models/glm-5-3-flash)
- [Step 5](https://artificialanalysis.ai/models/step-5)
- [Kimi K3](https://artificialanalysis.ai/models/kimi-k3)
- [Gemini 3.8 Flash](https://artificialanalysis.ai/models/gemini-3-8-flash)
- [DeepSeek V4.1 Flash](https://artificialanalysis.ai/models/deepseek-v4-1-flash)
- [MiniMax M3](https://artificialanalysis.ai/models/minimax-m3)

Missing score or cost values stay `—`; no values are interpolated. Adjacent deltas are emitted only where both consecutive measured tuples are complete. Equal displayed scores mean no measured gain at displayed precision, not proof that the underlying scores are identical. Pareto claims, if made downstream, must stay within one model and the same benchmark settings.
