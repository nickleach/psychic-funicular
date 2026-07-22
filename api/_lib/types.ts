// Arize remote-evaluator contract types

export interface ArizeMetadata {
  request_id: string;
  evaluator: string;
  record_id: string;
}

export interface ArizeEvalRequest {
  metadata: ArizeMetadata;
  /** Mapped span/trace fields; keys are whatever the user configured in the Arize UI */
  input: Record<string, unknown>;
}

export interface EvalResult {
  label?: string;
  score?: number;
  explanation?: string;
}

export type ModeResult = {
  status: number;
  body: EvalResult | Record<string, never>;
};

// Tool endpoint types
export interface ToolScoreRequest {
  record_id?: string;
  criteria?: string;
  text?: string;
  [key: string]: unknown;
}

export interface ToolScoreResult {
  label: string;
  score: number;
  rationale: string;
  source: string;
  criteria: string;
}

// Store entry captures full request for /requests debug endpoint
export interface CapturedRequest {
  ts: string;
  endpoint: string;
  mode: string;
  requestId?: string;
  evaluator?: string;
  recordId?: string;
  input?: Record<string, unknown>;
  responseStatus: number;
  responseBody: unknown;
}
