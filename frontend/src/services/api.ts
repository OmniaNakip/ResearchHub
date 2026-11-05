import type { ChatResponse, TokenUsage } from '../types';

export class RateLimitError extends Error {
  public retryAfterSeconds: number;
  constructor(message?: string, retryAfter: number = 30) {
    super(message || 'Gemini API Rate Limit Exceeded (429 Too Many Requests).');
    this.name = 'RateLimitError';
    this.retryAfterSeconds = retryAfter;
  }
}

export interface StreamCallbacks {
  onChunk: (chunk: string, accumulated: string) => void;
  onThought?: (thoughtChunk: string, accumulatedThought: string) => void;
  onPapersFound?: (count: number) => void;
}

export async function askQuestionStream(
  userMessage: string,
  language: string = 'auto',
  baseUrl: string,
  useMockMode: boolean = false,
  chatSummary?: string,
  recentHistory?: Array<{ role: 'user' | 'assistant'; content: string }>,
  callbacks?: StreamCallbacks
): Promise<ChatResponse> {
  const startTime = Date.now();

  // If Mock Mode is enabled, simulate realistic streaming
  if (useMockMode) {
    if (
      userMessage.toLowerCase().includes('rate limit') ||
      userMessage.toLowerCase().includes('rate-limit')
    ) {
      throw new RateLimitError(
        language === 'ar'
          ? 'تم تجاوز الحد الأقصى لطلبات Gemini API (429 Too Many Requests). يرجى الانتظار دقيقة حتى يعود الـ Rate للعمل.'
          : 'Gemini API rate limit has been exceeded (429 Too Many Requests). Please wait a moment for the quota to reset.'
      );
    }

    const duration = 1.8;
    const mock = generateMockResponse(userMessage, language, duration, chatSummary, recentHistory);

    // Simulate thinking progress
    if (callbacks?.onThought && mock.thought) {
      callbacks.onThought(mock.thought, mock.thought);
    }
    await new Promise((r) => setTimeout(r, 350));

    // Simulate chunk streaming word by word
    if (callbacks?.onChunk) {
      const words = mock.answer.split(' ');
      let accumulated = '';
      for (let i = 0; i < words.length; i++) {
        const word = words[i] + (i < words.length - 1 ? ' ' : '');
        accumulated += word;
        callbacks.onChunk(word, accumulated);
        await new Promise((r) => setTimeout(r, 20));
      }
    }

    return mock;
  }

  const cleanBase = baseUrl.replace(/\/+$/, '');
  const url = `${cleanBase}/api/Chat/ask`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 90000);

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'text/event-stream, application/json',
      },
      body: JSON.stringify({
        userMessage,
        language,
        chatSummary,
        recentHistory,
      }),
      signal: controller.signal,
    });

    if (res.status === 429) {
      let errMsg =
        language === 'ar'
          ? 'تم تجاوز الحد الأقصى لطلبات Gemini API (Rate Limit 429). الـ Rate سيُعاد ضبطه قريباً.'
          : 'Gemini API rate limit has been reached (429 Too Many Requests). Quota will reset shortly.';
      try {
        const errJson = await res.json();
        if (errJson.message) errMsg = errJson.message;
      } catch {
        // use fallback
      }
      throw new RateLimitError(errMsg);
    }

    if (!res.ok) {
      const errText = await res.text().catch(() => res.statusText);
      if (
        errText.includes('429') ||
        errText.includes('RESOURCE_EXHAUSTED') ||
        errText.includes('RATE_LIMIT') ||
        errText.includes('quota')
      ) {
        throw new RateLimitError();
      }
      throw new Error(`Server returned status ${res.status}: ${errText}`);
    }

    const contentType = res.headers.get('content-type') || '';

    // If SSE Streaming response
    if (contentType.includes('text/event-stream') && res.body) {
      const reader = res.body.getReader();
      const decoder = new TextDecoder('utf-8');
      let buffer = '';
      let accumulatedAnswer = '';
      let accumulatedThought = '';
      let finalResponse: ChatResponse | null = null;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (trimmed.startsWith('data: ')) {
            const dataStr = trimmed.slice(6);
            try {
              const event = JSON.parse(dataStr);
              if (event.type === 'chunk' && event.text) {
                accumulatedAnswer += event.text;
                callbacks?.onChunk(event.text, accumulatedAnswer);
              } else if (event.type === 'thought' && event.text) {
                accumulatedThought += event.text;
                callbacks?.onThought?.(event.text, accumulatedThought);
              } else if (event.type === 'papers' && event.count) {
                callbacks?.onPapersFound?.(event.count);
              } else if (event.type === 'error') {
                if (
                  event.status === 429 ||
                  event.error === 'RATE_LIMIT_EXCEEDED' ||
                  event.message?.includes('429')
                ) {
                  throw new RateLimitError(event.message);
                }
                throw new Error(event.message || 'Stream processing error');
              } else if (event.type === 'done') {
                const duration = (Date.now() - startTime) / 1000;
                finalResponse = {
                  answer: event.answer || accumulatedAnswer,
                  claims: event.claims || [],
                  updatedSummary: event.updatedSummary || '',
                  thought: event.thought || accumulatedThought,
                  thinkingDuration: duration,
                  usage: event.usage,
                };
              }
            } catch (jsonErr) {
              if (jsonErr instanceof RateLimitError) throw jsonErr;
              // Ignore partial JSON chunks
            }
          }
        }
      }

      if (finalResponse) {
        return finalResponse;
      }

      // If finished without explicit done event, build response from accumulated text
      const duration = (Date.now() - startTime) / 1000;
      return {
        answer: accumulatedAnswer,
        claims: [],
        thought: accumulatedThought,
        thinkingDuration: duration,
      };
    }

    // Standard JSON Fallback
    const data: ChatResponse = await res.json();
    const duration = (Date.now() - startTime) / 1000;
    if (callbacks?.onChunk && data.answer) {
      callbacks.onChunk(data.answer, data.answer);
    }
    return {
      ...data,
      thinkingDuration: data.thinkingDuration || duration,
    };
  } catch (err: unknown) {
    if (err instanceof RateLimitError) {
      throw err;
    }
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw new Error('Request timed out. The server or AI took too long to respond.');
    }
    if (err instanceof Error) {
      if (err.message.includes('429') || err.message.includes('RESOURCE_EXHAUSTED')) {
        throw new RateLimitError(err.message);
      }
      throw err;
    }
    throw new Error('An unexpected network error occurred.');
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function askQuestion(
  userMessage: string,
  language: string = 'auto',
  baseUrl: string,
  useMockMode: boolean = false,
  chatSummary?: string,
  recentHistory?: Array<{ role: 'user' | 'assistant'; content: string }>
): Promise<ChatResponse> {
  return askQuestionStream(
    userMessage,
    language,
    baseUrl,
    useMockMode,
    chatSummary,
    recentHistory
  );
}

export async function checkBackendHealth(baseUrl: string): Promise<boolean> {
  try {
    const cleanBase = baseUrl.replace(/\/+$/, '');
    const res = await fetch(`${cleanBase}/api/Chat/models`, {
      method: 'GET',
      headers: { Accept: 'application/json' },
    });
    return res.ok || res.status === 404 || res.status === 502 || res.status === 429;
  } catch {
    return false;
  }
}

function generateMockResponse(
  query: string,
  language: string,
  duration: number,
  chatSummary?: string,
  recentHistory?: Array<{ role: 'user' | 'assistant'; content: string }>
): ChatResponse {
  const isArabic = language === 'ar' || (language === 'auto' && /[\u0600-\u06FF]/.test(query));

  const userTokens = Math.max(1, Math.round(query.length / 3.6));
  const systemPromptTokens = 230;
  const papersTokens = 650;
  const historyTokens = recentHistory
    ? Math.round(JSON.stringify(recentHistory).length / 3.6)
    : 0;
  const summaryTokens = chatSummary ? Math.round(chatSummary.length / 3.6) : 0;

  const promptTokens =
    systemPromptTokens + papersTokens + historyTokens + summaryTokens + userTokens;
  const completionTokens = isArabic ? 340 : 285;
  const thinkingTokens = 92;
  const totalTokens = promptTokens + completionTokens + thinkingTokens;

  const usage: TokenUsage = {
    promptTokens,
    completionTokens,
    thinkingTokens,
    totalTokens,
    details: {
      systemPromptTokens,
      papersTokens,
      historyTokens,
      summaryTokens,
      userTokens,
    },
  };

  const updatedSummary = isArabic
    ? `ملخص المحادثة حتى الآن: تم مناقشة موضوع "${query}" مع استعراض الأوراق البحثية المستخرجة من OpenAlex، والتحقق من الأدلة العلمية في سياق حوار مستمر.`
    : `Conversation Summary So Far: Discussed "${query}" with grounding in OpenAlex scholarly literature, empirical claim verification, and continuous dialogue retention.`;

  const thought = isArabic
    ? `* **فحص الذاكرة السابقة**: تم فحص آخر 5 رسائل والملخص السابق بنجاح.
* **البحث الأكاديمي المباشر**: جلب أوراق بحثية محكمة من قاعدة بيانات OpenAlex.
* **تحديث الملخص المستمر (Overwrite)**: تحديث ملخص الحوار شاملاً المفاهيم الجديدة.
* **تفنيد الادعاءات والأدلة**: فحص موثوقية النتائج ومطابقتها لمستخلصات الأوراق العلمية.`
    : `* **Context & Memory Evaluation**: Synthesized previous rolling summary and last 5 dialog turns.
* **Scholarly Retrieval**: Queried OpenAlex database with reciprocal rank scoring.
* **Rolling Overwriting Summary**: Updated conversation summary in-place for long-term retention.
* **Evidence Verification**: Validated each claim against primary source passages and peer-reviewed abstracts.`;

  if (isArabic) {
    return {
      answer: `بناءً على الأوراق البحثية الأكاديمية المستخرجة من OpenAlex حول: **"${query}"**، تشير الدراسات الحديثة إلى نتائج مهمة:

### أبرز النتائج العلمية:
1. **الكفاءة والأداء**: أثبتت النماذج الحديثة كفاءة حسابية أعلى مع تقليل استهلاك الموارد بنسبة تتجاوز 35%.
2. **قابلية التفسير (Interpretability)**: استخدام آليات الانتباه وربط النتائج بأدلة موثوقة يقلل من نسب الهلوسة في المخرجات.
3. **التطبيقات العملية**: تم اعتماد المنهجيات في مجالات الرعاية الصحية، ومعالجة اللغات الطبيعية، واكتشاف الأدوية.`,
      thought,
      thinkingDuration: duration,
      updatedSummary,
      usage,
      claims: [
        {
          text: `النماذج المعتمدة على آليات الانتباه الذاتي تحقق نتائج متفوقة مقارنة بالهياكل التكرارية التقليدية في استيعاب السياق الطويل.`,
          type: 'empirical',
          evidence: [
            {
              sourcePassage:
                'We propose the Transformer, a model architecture eschewing recurrence and relying entirely on an attention mechanism to draw global dependencies between input and output.',
              paperLink: 'https://openalex.org/W2964313370',
              retrievalScore: 0.96,
            },
            {
              sourcePassage:
                'Experimental results show that our proposed attention mechanisms significantly outperform recurrent architectures across multiple benchmark datasets.',
              paperLink: 'https://openalex.org/W2741809807',
              retrievalScore: 0.88,
            },
          ],
        },
      ],
    };
  }

  return {
    answer: `Based on peer-reviewed academic publications retrieved from OpenAlex regarding **"${query}"**, research highlights several critical findings:

### Summary of Key Findings:
1. **Architectural Advancements**: Modern models achieve significantly higher scalability and sample efficiency by combining sparse attention mechanisms with parameter-efficient fine-tuning (PEFT).
2. **Factuality & Grounding**: Integrating retrieval pipelines reduces factual errors and hallucination rates in generative responses.
3. **Empirical Benchmarks**: Comprehensive evaluations across multiple academic benchmarks demonstrate statistically significant improvements over prior baselines.`,
    thought,
    thinkingDuration: duration,
    updatedSummary,
    usage,
    claims: [
      {
        text: 'Sparse and linear attention variants maintain expressive representation capacity while reducing quadratic computational complexity to O(N).',
        type: 'theoretical',
        evidence: [
          {
            sourcePassage:
              'We demonstrate that the computational bottleneck of standard self-attention can be effectively bypassed through low-rank kernel approximations and sparse routing.',
            paperLink: 'https://openalex.org/W2964313370',
            retrievalScore: 0.94,
          },
        ],
      },
    ],
  };
}
