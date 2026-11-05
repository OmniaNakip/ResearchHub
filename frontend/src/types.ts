export interface EvidenceResponse {
  sourcePassage: string;
  paperLink: string;
  retrievalScore: number;
}

export interface ClaimResponse {
  text: string;
  type: string;
  evidence: EvidenceResponse[];
}

export interface TokenUsageDetails {
  systemPromptTokens: number;
  papersTokens: number;
  historyTokens: number;
  summaryTokens: number;
  userTokens: number;
}

export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  thinkingTokens?: number;
  totalTokens: number;
  details?: TokenUsageDetails;
}

export interface ChatResponse {
  answer: string;
  thought?: string;
  thinkingDuration?: number;
  claims: ClaimResponse[];
  usage?: TokenUsage;
  updatedSummary?: string;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  thought?: string;
  thinkingDuration?: number;
  usage?: TokenUsage;
  claims?: ClaimResponse[];
  timestamp: number;
  loading?: boolean;
  isStreaming?: boolean;
  error?: string;
  isRateLimited?: boolean;
}

export interface Conversation {
  id: string;
  title: string;
  messages: ChatMessage[];
  summary?: string;
  updatedAt: number;
}

export interface AppSettings {
  backendUrl: string;
  language: 'auto' | 'en' | 'ar';
  isDarkMode: boolean;
  useMockMode: boolean;
}
