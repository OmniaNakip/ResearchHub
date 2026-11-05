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

export interface ChatResponse {
  answer: string;
  claims: ClaimResponse[];
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  claims?: ClaimResponse[];
  timestamp: number;
  loading?: boolean;
  error?: string;
}

export interface Conversation {
  id: string;
  title: string;
  messages: ChatMessage[];
  updatedAt: number;
}

export interface AppSettings {
  backendUrl: string;
  language: 'en' | 'ar';
  isDarkMode: boolean;
  useMockMode: boolean;
}
