export interface Criterion {
  id: string;
  label: string;
  /** Injected into the LLM judge prompt to focus scoring */
  judgeInstruction: string;
  passRationale: string;
  failRationale: string;
  passScore: number;
  failScore: number;
}

export const CRITERIA: Record<string, Criterion> = {
  lore_accuracy: {
    id: "lore_accuracy",
    label: "Lore Accuracy",
    judgeInstruction:
      "Evaluate whether the assistant's answer is factually accurate according to Star Wars canon (films, The Clone Wars, Rebels, and widely accepted Legends/EU where canon is silent). " +
      "Pass if all stated facts are correct. Fail if any fact contradicts established canon.",
    passRationale: "Answer is consistent with Star Wars canon.",
    failRationale: "Answer contains facts that contradict Star Wars canon.",
    passScore: 1.0,
    failScore: 0.0,
  },

  relevance: {
    id: "relevance",
    label: "Relevance",
    judgeInstruction:
      "Evaluate whether the assistant's answer directly and usefully addresses the user's question about Star Wars. " +
      "Pass if the response stays on-topic and answers what was asked. Fail if it diverges, is vague, or ignores the question.",
    passRationale: "Answer directly addresses the user's Star Wars question.",
    failRationale: "Answer is off-topic or does not address the question.",
    passScore: 0.9,
    failScore: 0.1,
  },

  hallucination: {
    id: "hallucination",
    label: "Hallucination",
    judgeInstruction:
      "Evaluate whether the assistant invented or fabricated any characters, events, planets, organizations, or other details not present in Star Wars canon or widely known Legends material. " +
      "Pass if the answer is grounded in real Star Wars lore. Fail if it makes up non-existent names, events, or attributes.",
    passRationale: "Answer does not invent non-canon Star Wars facts.",
    failRationale: "Answer invents or fabricates Star Wars facts not found in canon.",
    passScore: 1.0,
    failScore: 0.0,
  },

  in_character: {
    id: "in_character",
    label: "In Character",
    judgeInstruction:
      "Evaluate whether the assistant maintains its designated Star Wars persona consistently. " +
      "This includes appropriate vocabulary (e.g. Yoda's inverted syntax), references, and tone. " +
      "Pass if the persona is maintained throughout. Fail if the assistant breaks character, uses modern slang out of context, or addresses meta-topics unprompted.",
    passRationale: "Answer maintains the Star Wars persona consistently.",
    failRationale: "Answer breaks character or uses language inconsistent with the persona.",
    passScore: 0.85,
    failScore: 0.15,
  },
};

export const DEFAULT_CRITERIA_ID = "lore_accuracy";

export function getCriterion(id: string): Criterion {
  return CRITERIA[id] ?? CRITERIA[DEFAULT_CRITERIA_ID];
}

/** Resolve criteria from (in priority order):
 *  1. ?criteria= query param
 *  2. x-eval-criteria header
 *  3. evaluator name suffix after a dash: "llm-hallucination" → "hallucination"
 */
export function resolveCriteria(
  params: URLSearchParams,
  headers: Record<string, string | string[] | undefined>,
  evaluatorName?: string
): string {
  const qcriteria = params.get("criteria");
  if (qcriteria && CRITERIA[qcriteria]) return qcriteria;

  const hcriteria = headers["x-eval-criteria"];
  if (typeof hcriteria === "string" && CRITERIA[hcriteria]) return hcriteria;

  if (evaluatorName) {
    // e.g. "llm-hallucination" or "llm::hallucination"
    for (const id of Object.keys(CRITERIA)) {
      if (evaluatorName.toLowerCase().includes(id)) return id;
    }
  }

  return DEFAULT_CRITERIA_ID;
}
