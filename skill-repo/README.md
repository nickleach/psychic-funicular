# arize-test-eval skill repo

A custom skill for Arize Agent-as-a-Judge that calls the
[arize-test-eval-api](https://github.com/your-org/arize-test-eval-api)
scoring tool endpoint.

## Install as a custom skill in Arize

1. Go to **More → Agent Skills** in your Arize space.
2. Click **Add Skill → Custom skill**.
3. Fill in:
   - **Name:** `arize-test-eval`
   - **Install source:** `your-org/arize-test-eval-api` (this repo, `skill-repo/` dir, or a fork)
   - **Description:** `Calls POST /tool/score to score assistant outputs against named criteria (helpfulness, relevance, accuracy, tone).`
   - **Installer:** `github`
   - **Env vars (optional):** `TEST_API_TOKEN=<your EVAL_AUTH_TOKEN value>`
4. Save the skill.
5. Attach it to an agent preset in **More → Agent Presets**.

## What the harness gets

The harness clones this repo and reads `SKILL.md`, which documents the
`POST /tool/score` endpoint. The agent will call that endpoint when evaluating
spans, then write `label`, `score`, and `explanation` (from `rationale`) back
as eval attributes.

## Customizing

- Change the `criteria` your harness passes to steer what is scored.
- Add new criteria by extending the rubric table in `SKILL.md` and updating
  `api/_lib/modes.ts` → `CRITERIA_RUBRICS` in the main API repo.
- To gate the tool endpoint, set `EVAL_AUTH_TOKEN` on the server and
  `TEST_API_TOKEN` in the skill's env vars.
