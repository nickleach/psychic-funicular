# Star Wars Chatbot Eval API

A TypeScript serverless API on Vercel for testing [Arize](https://arize.com) evaluation features
against a Star Wars chatbot. Implements the full remote-evaluator HTTP contract with test-mode
knobs, a tool endpoint for Agent-as-a-Judge custom skills, and a debug buffer showing exactly
what Arize sent.

**Live:** [arize-test-eval-api.vercel.app](https://arize-test-eval-api.vercel.app)

## Eval criteria

Built around evaluating a Star Wars chatbot:

| Criterion | What it checks |
|---|---|
| `lore_accuracy` | All stated facts match Star Wars canon (default) |
| `hallucination` | Response does not invent non-canon characters, events, or planets |
| `relevance` | Response directly addresses the user's question |
| `in_character` | Response maintains the bot's Star Wars persona |

## Endpoints

| Method | Path | Auth | Description |
|---|---|---|---|
| `POST` | `/evaluate` | Required | Arize remote-evaluator contract |
| `POST` | `/tool/score` | Required | Tool endpoint for Agent-as-a-Judge skills |
| `GET` | `/health` | Open | Warmup / config status |
| `GET` | `/requests` | Required | Debug buffer of last 50 captured payloads |
| `DELETE` | `/requests` | Required | Clear the debug buffer |

## Test modes

Mode is selected (in priority order) from `?mode=`, `x-test-mode` header, or the Arize evaluator name prefix.
Name your Arize evaluator `stub-pass` and it always passes — no headers or query params needed.

| Mode | HTTP | What it tests |
|---|---|---|
| `keyword` (default) | 200 | Star Wars lore regex on output (Jedi, Sith, Force, …) |
| `stub-pass` | 200 | Fixed pass/1 — happy-path baseline |
| `stub-fail` | 200 | Fixed fail/0 — verify Arize records failures |
| `llm` | 200 | Real model call with Star Wars canon judge prompt |
| `no-verdict` | 200 `{}` | Arize "no label/score" failure path |
| `force-401` / `force-403` | 401/403 | Fatal auth — Arize stops retrying |
| `force-429` | 429 | Rate-limit — Arize backs off and retries |
| `force-500` | 500 | Transient error — Arize retries |
| `force-400` | 400 | Record failure, no retry |
| `slow-<ms>` | 200 | Delayed response — timeout / cold-start testing |

## LLM judge prompt (llm mode)

When `mode=llm`, the server calls OpenAI or Anthropic with a Star Wars canon judge prompt
tailored to the selected criterion. Pass the criterion via:
- `?criteria=hallucination` query param
- `x-eval-criteria: hallucination` header
- Evaluator name containing the criterion: `llm-hallucination`

Default criterion: `lore_accuracy`.

Example judge prompt for `lore_accuracy`:

> You are an expert Star Wars canon judge evaluating a chatbot's response.
> Criterion: Lore Accuracy
> Task: Evaluate whether the assistant's answer is factually accurate according to Star Wars canon
> (films, The Clone Wars, Rebels, and widely accepted Legends/EU where canon is silent).
> Pass if all stated facts are correct. Fail if any fact contradicts established canon.

## Deploy to Vercel

### 1. Clone and install

```bash
git clone https://github.com/nickleach/psychic-funicular.git
cd psychic-funicular
npm install
```

### 2. Configure environment variables

```bash
cp .env.example .env.local
```

| Variable | Required | Description |
|---|---|---|
| `EVAL_AUTH_TOKEN` | Recommended | Bearer token for protected endpoints |
| `OPENAI_API_KEY` | For `llm` mode | OpenAI API key |
| `ANTHROPIC_API_KEY` | For `llm` mode | Anthropic API key |
| `LLM_PROVIDER` | Optional | `openai` or `anthropic` (default: `openai`) |
| `LLM_MODEL` | Optional | Model name override |
| `KV_REST_API_URL` | Optional | Upstash REST URL for durable `/requests` capture |
| `KV_REST_API_TOKEN` | Optional | Upstash token |

### 3. Run locally

```bash
npm run dev
# → http://localhost:3000
./scripts/test.sh
# With auth:
./scripts/test.sh http://localhost:3000 your-secret-token
```

### 4. Deploy

```bash
npx vercel --prod
vercel env add EVAL_AUTH_TOKEN
vercel env add OPENAI_API_KEY   # optional, only for llm mode
```

## Register as a remote evaluator in Arize

1. **Evaluators → Create → Remote evaluator** in your Arize space.
2. **Endpoint URL:** `https://arize-test-eval-api.vercel.app/evaluate`
3. **Auth header:** `Authorization: Bearer <your EVAL_AUTH_TOKEN>`
4. **Column mapping:** map `attributes.input.value` → `input`, `attributes.output.value` → `output`
5. **Evaluator name:** controls the test mode — use any of the names in the mode table above.

Check `/requests` to see exactly what Arize sent:

```bash
curl -H "Authorization: Bearer <token>" \
  https://arize-test-eval-api.vercel.app/requests | jq .
```

## Quick-start evaluator names for Arize

Create one evaluator per mode to exercise every Arize path:

| Arize evaluator name | What gets tested |
|---|---|
| `stub-pass` | Always-pass baseline |
| `stub-fail` | Always-fail, verify failure recording |
| `keyword` | Lore keyword scoring (Jedi, Sith, Force, …) |
| `no-verdict` | Arize failure handling when 2xx has no label/score |
| `force-429` | Retry / backoff |
| `force-500` | Transient error retry |
| `force-401` | Fatal auth stop |

## Use with Agent-as-a-Judge + Skills

### Create the evaluator

1. **Evaluators → Create → Agent-as-a-Judge**
2. Select harness (Claude Code), model, and write scoring instructions:

   > For each span from the Star Wars chatbot, extract the assistant's response from
   > `attributes.output.value`. Call the `score` tool with `criteria: "lore_accuracy"` and
   > the response text. Use the returned `label` and `score` as the eval result;
   > use `rationale` as the explanation. Also run `criteria: "hallucination"` on the same span
   > to detect fabricated facts.

3. Optionally fix labels to `pass` / `fail`.

### Add the custom skill

1. **More → Agent Skills → Add Skill → Custom skill**
2. **Name:** `star-wars-eval`
3. **Install source:** `nickleach/psychic-funicular`
4. **Description:** `Scores Star Wars chatbot outputs via POST /tool/score. Criteria: lore_accuracy, hallucination, relevance, in_character.`
5. **Installer:** `github`
6. **Env vars:** `TEST_API_TOKEN=<your EVAL_AUTH_TOKEN>`
7. Attach to a preset in **More → Agent Presets** and use that preset for the Agent-as-a-Judge task.

## Debug captured requests

```bash
# View what Arize sent
curl -H "Authorization: Bearer <token>" \
  https://arize-test-eval-api.vercel.app/requests | jq .

# Clear between test runs
curl -X DELETE -H "Authorization: Bearer <token>" \
  https://arize-test-eval-api.vercel.app/requests
```

Without Upstash KV, `/requests` is an in-memory ring buffer that resets on cold starts.
Set `KV_REST_API_URL` + `KV_REST_API_TOKEN` for durable capture.

## Project structure

```
.
├── api/
│   ├── _lib/
│   │   ├── auth.ts       # Bearer token check (timing-safe)
│   │   ├── criteria.ts   # Star Wars eval criteria registry
│   │   ├── llm.ts        # OpenAI / Anthropic Star Wars canon judge
│   │   ├── modes.ts      # Mode resolution + behavior table
│   │   ├── store.ts      # In-memory ring buffer + optional Upstash
│   │   └── types.ts      # Shared TypeScript types
│   ├── tool/
│   │   └── score.ts      # POST /tool/score
│   ├── evaluate.ts       # POST /evaluate  (remote-evaluator contract)
│   ├── health.ts         # GET  /health
│   └── requests.ts       # GET/DELETE /requests
├── public/
│   └── index.html        # Landing page
├── scripts/
│   └── test.sh           # curl test suite (Star Wars payloads)
├── skill-repo/
│   ├── SKILL.md          # Custom skill descriptor for Agent-as-a-Judge
│   └── README.md         # How to install in Arize
├── .env.example
├── package.json
├── tsconfig.json
└── vercel.json
```
