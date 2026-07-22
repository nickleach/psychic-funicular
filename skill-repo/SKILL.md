# arize-test-eval skill

This skill gives the Agent-as-a-Judge harness access to a scoring tool endpoint
hosted by the arize-test-eval-api.

## Tool: score

Score an assistant response against a named criteria.

### Endpoint

```
POST https://<your-app>.vercel.app/tool/score
Content-Type: application/json
Authorization: Bearer $TEST_API_TOKEN   # omit if EVAL_AUTH_TOKEN is not set
```

### Request body

```json
{
  "record_id": "<span or example id>",
  "criteria": "<helpfulness|relevance|accuracy|tone>",
  "text": "<the assistant output to score>"
}
```

### Response

```json
{
  "label": "pass",
  "score": 0.9,
  "rationale": "Response is actionable and directly addresses the request.",
  "source": "arize-test-eval-api/tool/score",
  "criteria": "helpfulness"
}
```

### Fields

| Field | Description |
|---|---|
| `label` | `"pass"` or `"fail"` |
| `score` | Float 0–1 |
| `rationale` | One-sentence reason |
| `source` | Always `arize-test-eval-api/tool/score` |
| `criteria` | Echoed from request |

### Supported criteria

| Value | What it checks |
|---|---|
| `helpfulness` | Response is actionable and addresses the request |
| `relevance` | Response stays on topic |
| `accuracy` | Response appears factually correct |
| `tone` | Response uses appropriate, professional tone |

### Usage instructions for the harness

When evaluating a span, extract the assistant's output text and call this tool
with the appropriate criteria. Write the returned `label` and `score` as the
eval result for that span.

Example:

```
call score({
  record_id: span.id,
  criteria: "helpfulness",
  text: span.attributes["output.value"]
})
→ { label: "pass", score: 0.9, rationale: "..." }
```

Use the `rationale` field as the eval `explanation`.

### Error handling

| Status | Meaning |
|---|---|
| `400` | `text` field missing — check your input extraction |
| `401` | `TEST_API_TOKEN` env var not set or wrong |
| `405` | Wrong HTTP method — must be POST |

### Environment variables

| Name | Required | Description |
|---|---|---|
| `TEST_API_TOKEN` | If server has auth | Bearer token matching the server's `EVAL_AUTH_TOKEN` |
