/**
 * Summary information for a Gemini model.
 * Matches the GeminiModelSummary model from the Python API.
 */
export interface GeminiModelSummary {
  /** Model name (e.g., 'gemini-2.0-flash-exp', 'gemini-1.5-pro') */
  name: string;
  /** Display name for the model */
  displayName: string;
  /** Model description */
  description?: string;
  /** Version of the model */
  version?: string;
  /** List of supported generation methods (e.g., 'generateContent', 'streamGenerateContent') */
  supportedGenerationMethods: string[];
  /** Maximum input tokens */
  inputTokenLimit?: number;
  /** Maximum output tokens */
  outputTokenLimit?: number;
  /** Temperature range */
  temperature?: number;
  /** Top-p range */
  topP?: number;
  /** Top-k range */
  topK?: number;
}

/**
 * Response model for listing Gemini models.
 * Matches the GeminiModelsResponse model from the Python API.
 */
export interface GeminiModelsResponse {
  /** List of Gemini model summaries */
  models: GeminiModelSummary[];
  /** Total count of models returned */
  totalCount: number;
}

/**
 * Query parameters for listing Gemini models.
 */
export interface ListGeminiModelsParams {
  /** Maximum number of models to return (client-side limit) */
  maxResults?: number;
}
