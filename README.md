# arize-test-eval-api

A small TypeScript serverless API deployed on Vercel for testing Arize features:

- **Remote evaluators** — implements Arize's HTTP contract with test-mode knobs
- **Agent-as-a-Judge** — provides a tool endpoint that custom skills can call
- **Skills** — includes a ready-to-use custom-skill layout in `skill-repo/`

## Endpoints

| Method | Path | Description |
|---|---|---|
| `POST` | `/evaluate` | Arize remote-evaluator contract |
| `POST` | `/tool/score` | Tool endpoint for Agent-as-a-Judge skills |
| `GET` | `/health` | Warmup / connectivity check |
| `GET` | `/requests` | Debug buffer of recent captured requests |
| `DELETE` | `/requests` | Clear the debug buffer |

## Test modes

Behavior on `/evaluate` is controlled (in priority order) by:
1. `?mode=<mode>` query param
2. `x-test-mode: <mode>` request header
3. `metadata.evaluator` prefix in the request body (e.g. naming your Arize evaluator `stub-pass`)

| Mode | HTTP status | Body | What it tests |
|---|---|---|---|
| `keyword` (default) | 200 | label + score | Rule-based regex scoring |
| `stub-pass` | 200 | `{label:"pass", score:1}` | Happy path |
| `stub-fail` | 200 | `{label:"fail", score:0}` | Fail verdict |
| `llm` | 200 | parsed model verdict | Real LLM call |
| `no-verdict` | 200 | `{}` | Arize "no label/score" failure path |
| `force-401` | 401 | — | Fatal auth failure (Arize stops retrying) |
| `force-403` | 403 | — | Fatal auth failure |
| `force-429` | 429 | — | Rate-limit backoff + retry |
| `force-500` | 500 | — | Transient error retry |
| `force-400` | 400 | — | Record failure, no retry |
| `slow-<ms>` | 200 | pass verdict | Delayed response (timeout testing) |

## Deploy to Vercel

### 1. Clone and install

```bash
git clone https://github.com/your-org/arize-test-eval-api.git
cd arize-test-eval-api
npm install
```

### 2. Set environment variables

Copy `.env.example` and fill in values:

```bash
cp .env.example .env.local
```

| Variable | Required | Description |
|---|---|---|
| `EVAL_AUTH_TOKEN` | Recommended | Bearer token for `/evaluate` and `/tool/score` |
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
```

Verify with the test script:

```bash
./scripts/test.sh
# With auth:
./scripts/test.sh http://localhost:3000 your-secret-token
```

### 4. Deploy

```bash
npx vercel --prod
```

Set env vars in the Vercel dashboard under **Project → Settings → Environment Variables**, or via CLI:

```bash
vercel env add EVAL_AUTH_TOKEN
vercel env add OPENAI_API_KEY
```

Your public URL will be `https://<app-name>.vercel.app`.

## Register as a remote evaluator in Arize

1. Go to **Evaluators → Create → Remote evaluator** in your Arize space.
2. Set **Endpoint URL** to `https://<app-name>.vercel.app/evaluate`.
3. Add a header: `Authorization: Bearer <your EVAL_AUTH_TOKEN>`.
4. Map your span columns to `input` keys (e.g. `input.value` → `input`, `output.value` → `output`).
5. Name the evaluator — the name controls test-mode if you use a mode prefix like `stub-pass`.
6. Create an eval task, attach this evaluator, set scope and sampling rate, and run.

Check `/requests` to see what Arize actually sent:

```bash
curl https://<app-name>.vercel.app/requests
```

## Register a remote evaluator per mode (quick-start)

Create one Arize evaluator per mode to test all paths without needing headers:

| Arize evaluator name | What gets tested |
|---|---|
| `stub-pass` | Always-pass happy path |
| `stub-fail` | Always-fail path |
| `keyword` | Rule-based scoring |
| `no-verdict` | Arize failure-handling when 2xx has no label/score |
| `force-429` | Retry / backoff behavior |
| `force-500` | Transient error retry |
| `force-401` | Fatal auth stop |

## Use with Agent-as-a-Judge + Skills

### Create the evaluator

1. **Evaluators → Create → Agent-as-a-Judge** in Arize.
2. Select harness (Claude Code), model, and write scoring instructions:
   > *For each span, call the `score` tool with the span's output text and criteria="helpfulness". Use the returned label and score as the eval result. Use the rationale as the explanation.*
3. Optionally restrict labels to `pass` / `fail`.
4. Save to Evaluator Hub.

### Add the custom skill

1. Go to **More → Agent Skills → Add Skill → Custom skill**.
2. Fill in:
   - **Name:** `arize-test-eval`
   - **Install source:** `your-org/arize-test-eval-api` (the `skill-repo/` directory)
   - **Description:** `Scores assistant outputs via POST /tool/score. Criteria: helpfulness, relevance, accuracy, tone.`
   - **Installer:** `github`
   - **Env vars:** `TEST_API_TOKEN=<your EVAL_AUTH_TOKEN>`
3. Attach the skill to a preset in **More → Agent Presets**.
4. When creating the Agent-as-a-Judge eval task, select that preset.

The harness reads `skill-repo/SKILL.md`, discovers the `POST /tool/score` endpoint, calls it for each span, and writes back eval attributes.

## Debug captured requests

After running an eval, inspect what Arize sent:

```bash
# List recent requests
curl https://<app-name>.vercel.app/requests | jq .

# Clear buffer between runs
curl -X DELETE https://<app-name>.vercel.app/requests
```

> **Note:** Without Upstash KV configured, `/requests` uses an in-memory ring buffer that resets on cold starts. Set `KV_REST_API_URL` + `KV_REST_API_TOKEN` (Upstash) for durable capture across serverless instances.

## Project structure

```
.
├── api/
│   ├── _lib/
│   │   ├── auth.ts       # Bearer token check
│   │   ├── llm.ts        # OpenAI / Anthropic calls
│   │   ├── modes.ts      # Mode resolution + behavior table
│   │   ├── store.ts      # In-memory ring buffer + optional Upstash
│   │   └── types.ts      # Shared TypeScript types
│   ├── tool/
│   │   └── score.ts      # POST /tool/score
│   ├── evaluate.ts       # POST /evaluate  (remote-evaluator contract)
│   ├── health.ts         # GET  /health
│   └── requests.ts       # GET/DELETE /requests
├── scripts/
│   └── test.sh           # curl test suite for all modes
├── skill-repo/
│   ├── SKILL.md          # Custom skill descriptor for Agent-as-a-Judge harness
│   └── README.md         # How to install this as a custom skill in Arize
├── .env.example
├── package.json
├── tsconfig.json
└── vercel.json
```
