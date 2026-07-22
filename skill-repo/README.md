# star-wars-eval skill repo

A custom skill for Arize Agent-as-a-Judge that evaluates a **Star Wars chatbot**
by calling the [arize-test-eval-api](https://github.com/nickleach/psychic-funicular)
`/tool/score` endpoint.

The harness reads `SKILL.md` and learns to call `POST /tool/score` with the
chatbot's output text and a criterion, then writes the returned `label`, `score`,
and `rationale` back as eval attributes on the span.

## Install as a custom skill in Arize

1. Go to **More → Agent Skills** in your Arize space.
2. Click **Add Skill → Custom skill**.
3. Fill in:
   - **Name:** `star-wars-eval`
   - **Install source:** `nickleach/psychic-funicular` (or your fork)
   - **Description:** `Scores Star Wars chatbot outputs via POST /tool/score. Criteria: lore_accuracy, hallucination, relevance, in_character.`
   - **Installer:** `github`
   - **Env vars (optional):** `TEST_API_TOKEN=<your EVAL_AUTH_TOKEN value>`
4. Save the skill.
5. Attach it to an agent preset in **More → Agent Presets**.

## Suggested Agent-as-a-Judge scoring instructions

Use something like this in your Agent-as-a-Judge evaluator config:

> For each span from the Star Wars chatbot, extract the assistant's response from
> `attributes.output.value`. Call the `score` tool with:
> - `criteria`: `lore_accuracy` to check canon accuracy, or `hallucination` to
>   check for fabricated facts, or `in_character` if the bot has a persona.
> - `text`: the assistant's response text.
>
> Use the returned `label` and `score` as the eval result.
> Use `rationale` as the `explanation`.
>
> You may evaluate the same span on multiple criteria.

## Criteria reference

| Criterion | Pass means |
|---|---|
| `lore_accuracy` | All facts match Star Wars canon |
| `hallucination` | No invented characters, events, or planets |
| `relevance` | Response addresses the user's question |
| `in_character` | Persona is maintained throughout |

## Auth

If `EVAL_AUTH_TOKEN` is set on the server, add `TEST_API_TOKEN=<value>` in
the skill's env vars section. The server compares it as
`Authorization: Bearer <token>`.
