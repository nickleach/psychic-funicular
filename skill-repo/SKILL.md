# star-wars-eval skill

This skill gives the Agent-as-a-Judge harness access to a scoring tool endpoint
for evaluating a Star Wars chatbot's responses against canon accuracy, relevance,
hallucination, and in-character criteria.

## Tool: score

Score a Star Wars chatbot's output against a named criterion.

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
  "criteria": "<lore_accuracy|hallucination|relevance|in_character>",
  "text": "<the chatbot output to score>"
}
```

### Response

```json
{
  "label": "pass",
  "score": 1.0,
  "rationale": "Answer is consistent with Star Wars canon.",
  "source": "arize-test-eval-api/tool/score",
  "criteria": "lore_accuracy"
}
```

### Supported criteria

| Value | What it checks |
|---|---|
| `lore_accuracy` | All stated facts match Star Wars canon (films, TCW, Rebels) |
| `hallucination` | Response does not invent non-canon characters, events, or planets |
| `relevance` | Response directly addresses the user's Star Wars question |
| `in_character` | Response maintains the bot's Star Wars persona (e.g. Yoda syntax) |

### Usage instructions for the harness

When evaluating a Star Wars chatbot span, extract the assistant's output text
and call this tool with the appropriate criterion. Write the returned `label`
and `score` as the eval result; use `rationale` as the `explanation`.

Example workflow for a lore accuracy check:

```
call score({
  record_id: span.id,
  criteria: "lore_accuracy",
  text: span.attributes["output.value"]
})
→ { label: "pass", score: 1.0, rationale: "Answer is consistent with Star Wars canon." }
```

For hallucination checks on spans where the user asked about specific characters:

```
call score({
  record_id: span.id,
  criteria: "hallucination",
  text: span.attributes["output.value"]
})
→ { label: "fail", score: 0.0, rationale: "Answer invents or fabricates Star Wars facts not found in canon." }
```

You may run multiple criteria on the same span and write separate eval attributes
(e.g. `eval.lore_accuracy.label`, `eval.hallucination.label`).

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
