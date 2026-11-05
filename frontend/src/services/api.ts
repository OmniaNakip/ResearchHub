import type { ChatResponse } from '../types';

export async function askQuestion(
  userMessage: string,
  language: string = 'en',
  baseUrl: string,
  useMockMode: boolean = false
): Promise<ChatResponse> {
  // If Mock Mode is enabled, return realistic academic test response
  if (useMockMode) {
    await new Promise((resolve) => setTimeout(resolve, 1200)); // Simulate AI reasoning time
    return generateMockResponse(userMessage, language);
  }

  const cleanBase = baseUrl.replace(/\/+$/, '');
  const url = `${cleanBase}/api/Chat/ask`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 60000);

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        userMessage,
        language,
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => res.statusText);
      throw new Error(`Server returned status ${res.status}: ${errText}`);
    }

    const data: ChatResponse = await res.json();
    return data;
  } catch (err: unknown) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw new Error('Request timed out. The server or AI took too long to respond.');
    }
    if (err instanceof Error) {
      throw err;
    }
    throw new Error('An unexpected network error occurred.');
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function checkBackendHealth(baseUrl: string): Promise<boolean> {
  try {
    const cleanBase = baseUrl.replace(/\/+$/, '');
    const res = await fetch(`${cleanBase}/api/Chat/models`, {
      method: 'GET',
      headers: { Accept: 'application/json' },
    });
    return res.ok || res.status === 404 || res.status === 502;
  } catch {
    return false;
  }
}

function generateMockResponse(query: string, language: string): ChatResponse {
  const isArabic = language === 'ar';

  if (isArabic) {
    return {
      answer: `بناءً على الأوراق البحثية الأكاديمية المستخرجة من OpenAlex حول: **"${query}"**، تشير الدراسات الحديثة إلى تقدم كبير في هذا المجال.

### أبرز النتائج العلمية:
1. **الكفاءة والأداء**: أثبتت النماذج الحديثة كفاءة حسابية أعلى مع تقليل استهلاك الموارد بنسبة تتجاوز 35%.
2. **قابلية التفسير (Interpretability)**: استخدام آليات الانتباه وربط النتائج بأدلة موثوقة يقلل من نسب الهلوسة في المخرجات.
3. **التطبيقات العملية**: تم اعتماد المنهجيات في مجالات الرعاية الصحية، ومعالجة اللغات الطبيعية، واكتشاف الأدوية.`,
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
        {
          text: `تقنيات التعزيز المعتمدة على الاسترجاع (RAG) تقلل بشكل ملحوظ من هلوسة النماذج اللغوية الكبيرة.`,
          type: 'comparative',
          evidence: [
            {
              sourcePassage:
                'Retrieval-augmented models demonstrate substantially lower hallucination rates when grounded in domain-specific corpus databases.',
              paperLink: 'https://openalex.org/W3101809812',
              retrievalScore: 0.91,
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
2. **Factuality & Grounding**: Integrating retrieval pipelines (such as OpenAlex and semantic search) reduces factual errors and hallucination rates in generative responses.
3. **Empirical Benchmarks**: Comprehensive evaluations across multiple academic benchmarks demonstrate statistically significant improvements over prior baselines.`,
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
          {
            sourcePassage:
              'Empirical evaluation across language modeling benchmarks confirms matching perplexity scores with a 3.4x throughput speedup.',
            paperLink: 'https://openalex.org/W3014766944',
            retrievalScore: 0.87,
          },
        ],
      },
      {
        text: 'Retrieval grounding directly links claims to primary scholarly literature, enhancing human verifiability.',
        type: 'methodological',
        evidence: [
          {
            sourcePassage:
              'By pairing each claim with reciprocal rank-scored passages, users can audit model assertions against original scholarly sources with high precision.',
            paperLink: 'https://openalex.org/W3125890211',
            retrievalScore: 0.92,
          },
        ],
      },
    ],
  };
}
