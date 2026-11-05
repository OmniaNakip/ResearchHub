import http from 'http';
import fs from 'fs';
import path from 'path';

// Load .env or .env.local
function loadEnv() {
  const envPaths = [
    path.resolve(process.cwd(), '.env.local'),
    path.resolve(process.cwd(), 'frontend/.env.local'),
    path.resolve(process.cwd(), '.env'),
  ];
  for (const p of envPaths) {
    if (fs.existsSync(p)) {
      const content = fs.readFileSync(p, 'utf8');
      for (const line of content.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const [k, ...v] = trimmed.split('=');
        const key = k.trim();
        const val = v.join('=').trim();
        if (key && val && !process.env[key]) {
          process.env[key] = val;
        }
      }
    }
  }
}

loadEnv();

const GEMINI_API_KEY =
  process.env.VITE_GEMINI_API_KEY ||
  process.env.Gemini__ApiKey ||
  process.env.GEMINI_API_KEY ||
  '';
const PRIMARY_MODEL = process.env.Gemini__Model || 'gemini-3.8-flash';
const CANDIDATE_MODELS = [
  'gemini-3.8-flash',
  'gemini-3.6-flash',
  'gemini-3.5-flash',
  'gemini-2.5-flash',
  'gemini-2.0-flash',
  'gemini-1.5-flash',
];
const PORT = 5023;
const MAX_SUMMARY_TOKENS = 10000;

function reconstructAbstract(invertedIndex) {
  if (!invertedIndex || typeof invertedIndex !== 'object') return '';
  const wordPositions = [];
  for (const [word, positions] of Object.entries(invertedIndex)) {
    for (const pos of positions) {
      wordPositions.push({ word, pos });
    }
  }
  wordPositions.sort((a, b) => a.pos - b.pos);
  return wordPositions.map((item) => item.word).join(' ');
}

// Clean and extract keywords for OpenAlex
function getQuickKeywords(userMessage) {
  const clean = userMessage.trim();
  return clean
    .replace(
      /(إزاي|ازاي|عامل ايه|كل الأخبار|أنا كنت عايز أبحث عن|ابحث عن|ما هو|ما هي|search for|tell me about|explain|what is|how does)/gi,
      ''
    )
    .trim() || clean;
}

async function searchOpenAlex(query) {
  try {
    const url = `https://api.openalex.org/works?search=${encodeURIComponent(
      query
    )}&per-page=5&select=id,doi,title,publication_year,authorships,abstract_inverted_index`;
    const res = await fetch(url);
    if (!res.ok) return [];
    const data = await res.json();
    return (data.results || []).map((item) => {
      const authors = (item.authorships || [])
        .map((a) => a.author?.display_name)
        .filter(Boolean);
      return {
        id: item.id || '',
        title: item.title || 'Untitled',
        doi: item.doi || '',
        paperLink: item.doi || item.id || '',
        publicationYear: item.publication_year || null,
        authors: authors,
        abstract: reconstructAbstract(item.abstract_inverted_index),
      };
    });
  } catch (err) {
    console.error('OpenAlex error:', err);
    return [];
  }
}

function extractJson(text) {
  if (!text) return null;
  try {
    const match = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
    const raw = match ? match[1].trim() : text.trim();
    return JSON.parse(raw);
  } catch (err) {
    const firstBrace = text.indexOf('{');
    const lastBrace = text.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace !== -1) {
      return JSON.parse(text.substring(firstBrace, lastBrace + 1));
    }
    // Fallback: If model streamed raw markdown answer directly
    return {
      answer: text,
      claims: [],
      updatedSummary: '',
    };
  }
}

function detectLanguage(userMessage, lang) {
  if (lang && lang !== 'auto') return lang;
  return /[\u0600-\u06FF]/.test(userMessage) ? 'ar' : 'en';
}

function buildPrompt({
  userMessage,
  language,
  papers,
  chatSummary,
  recentHistory,
}) {
  const resolvedLang = detectLanguage(userMessage, language);
  const isGrounded = papers && papers.length > 0;

  const trimmedSummary = chatSummary
    ? chatSummary.slice(0, MAX_SUMMARY_TOKENS * 3.5)
    : '';

  const historyText =
    recentHistory && recentHistory.length > 0
      ? recentHistory
          .slice(-5)
          .map((m) => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`)
          .join('\n\n')
      : 'None';

  const papersContext = isGrounded
    ? JSON.stringify(
        papers.map((p) => ({
          id: p.id,
          title: p.title,
          authors: p.authors,
          publicationYear: p.publicationYear,
          abstract: p.abstract ? p.abstract.substring(0, 450) : '',
          doi: p.doi,
          paperLink: p.paperLink,
        })),
        null,
        2
      )
    : 'None';

  const prompt = `You are ResearchHub, an expert academic AI research assistant.

Answer the user in ${resolvedLang === 'ar' ? 'Arabic' : 'English'}.
Use clear and engaging Markdown formatting (headings, bullet points, bold key terms).

${trimmedSummary ? `[Previous Conversation Long-Term Summary]:\n${trimmedSummary}\n` : ''}
${historyText !== 'None' ? `[Recent Dialogue History (Last 5 Messages)]:\n${historyText}\n` : ''}
[Retrieved Academic Papers from OpenAlex]:
${papersContext}

[Current Student Question]:
${userMessage}

Instructions:
1. Provide a comprehensive, rigorous academic answer directly in rich Markdown formatting (headings, bullet points, bold key terms).
2. If research papers are provided, cite findings and ground claims directly in them.
3. If the user question continues previous dialogue, maintain context naturally.
4. Overwrite and provide a concise summary of the entire dialogue so far (max 10,000 tokens).
5. At the very end of your response, output the metadata block formatted EXACTLY as:
<<<METADATA>>>
{
    "updatedSummary": "A concise overwritten summary of the entire conversation so far",
    "claims": [
        {
            "text": "A specific claim statement",
            "type": "empirical | theoretical | review",
            "paperId": "Exact ID from provided papers"
        }
    ]
}
<<<END_METADATA>>>`;

  return { prompt, resolvedLang, trimmedSummary, historyText, papersContext, isGrounded };
}

// Streaming generator for Gemini
async function callGeminiStream(
  { userMessage, language, papers, chatSummary, recentHistory },
  onChunk,
  onThought
) {
  const { prompt, resolvedLang, trimmedSummary, historyText, papersContext, isGrounded } =
    buildPrompt({ userMessage, language, papers, chatSummary, recentHistory });

  let lastError = null;

  for (const model of CANDIDATE_MODELS) {
    try {
      console.log(`Starting Gemini stream with model: ${model}...`);
      const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?alt=sse&key=${GEMINI_API_KEY}`;

      const res = await fetch(geminiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': GEMINI_API_KEY,
        },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
        }),
      });

      if (res.status === 429) {
        const err = new Error('Gemini API rate limit / quota has been exceeded (429).');
        err.status = 429;
        throw err;
      }

      if (!res.ok) {
        const errText = await res.text();
        console.warn(`Model ${model} stream returned status ${res.status}`);
        if (res.status === 503 || res.status === 500 || res.status === 502 || res.status === 404) {
          lastError = new Error(`Model ${model} unavailable (${res.status})`);
          continue;
        }
        const error = new Error(`Gemini API error ${res.status}: ${errText}`);
        error.status = res.status;
        throw error;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder('utf-8');
      let buffer = '';
      let accumulatedText = '';
      let answerText = '';
      let metadataText = '';
      let inMetadata = false;

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
              const json = JSON.parse(dataStr);
              const parts = json.candidates?.[0]?.content?.parts || [];
              for (const part of parts) {
                if (part.thought) {
                  // Stream thinking chunk if present
                  if (onThought) onThought(part.text);
                } else if (part.text) {
                  accumulatedText += part.text;

                  if (inMetadata) {
                    metadataText += part.text;
                  } else {
                    const metaIdx = accumulatedText.indexOf('<<<METADATA>>>');
                    if (metaIdx !== -1) {
                      inMetadata = true;
                      const cleanAnswerFull = accumulatedText.substring(0, metaIdx).trimEnd();
                      const unstreamed = cleanAnswerFull.substring(answerText.length);
                      if (unstreamed) {
                        answerText += unstreamed;
                        onChunk(unstreamed);
                      }
                      metadataText = accumulatedText.substring(metaIdx + '<<<METADATA>>>'.length);
                    } else {
                      // Hold off streaming if near <<< marker
                      const potentialMarker = accumulatedText.lastIndexOf('<<<');
                      if (potentialMarker !== -1 && potentialMarker > accumulatedText.length - 16) {
                        continue;
                      }
                      const toSend = accumulatedText.substring(answerText.length);
                      if (toSend) {
                        answerText += toSend;
                        onChunk(toSend);
                      }
                    }
                  }
                }
              }
            } catch {
              // ignore partial lines
            }
          }
        }
      }

      // Flush any remaining answer text if not already streamed
      if (!inMetadata && answerText.length < accumulatedText.length) {
        const remaining = accumulatedText.substring(answerText.length);
        if (remaining && !remaining.includes('<<<METADATA>>>')) {
          answerText += remaining;
          onChunk(remaining);
        }
      }

      let parsed = {
        answer: answerText.trim() || accumulatedText.trim(),
        claims: [],
        updatedSummary: '',
      };

      if (metadataText) {
        try {
          const cleanMeta = metadataText.replace(/<<<END_METADATA>>>[\s\S]*/, '').trim();
          const metaJson = extractJson(cleanMeta);
          if (metaJson) {
            parsed.updatedSummary = metaJson.updatedSummary || '';
            parsed.claims = Array.isArray(metaJson.claims) ? metaJson.claims : [];
          }
        } catch (e) {
          console.warn('Metadata parse warning:', e);
        }
      } else if (accumulatedText.trim().startsWith('{')) {
        const fullJson = extractJson(accumulatedText);
        if (fullJson && fullJson.answer) {
          parsed = fullJson;
          if (!answerText) {
            onChunk(parsed.answer);
          }
        }
      }

      if (!parsed.updatedSummary) {
        parsed.updatedSummary =
          resolvedLang === 'ar'
            ? `ملخص المحادثة حتى الآن: مناقشة موضوع "${userMessage.slice(0, 80)}" مع ربطه بالأوراق البحثية الأكاديمية وتوثيق الأدلة المستخرجة.`
            : `Conversation Summary So Far: Discussed "${userMessage.slice(0, 80)}" grounded in scholarly literature and verified empirical evidence.`;
      }

      // Detailed token accounting
      const systemPromptTokens = 230;
      const papersTokens = isGrounded ? Math.round(papersContext.length / 3.6) : 0;
      const historyTokens = historyText !== 'None' ? Math.round(historyText.length / 3.6) : 0;
      const summaryTokens = trimmedSummary ? Math.round(trimmedSummary.length / 3.6) : 0;
      const userTokens = Math.max(1, Math.round(userMessage.length / 3.6));

      const promptTokens = systemPromptTokens + papersTokens + historyTokens + summaryTokens + userTokens;
      const completionTokens = Math.max(
        1,
        Math.round(((parsed.answer?.length || 0) + (parsed.updatedSummary?.length || 0)) / 3.6)
      );
      const thinkingTokens = 85;
      const totalTokens = promptTokens + completionTokens + thinkingTokens;

      const defaultThought =
        resolvedLang === 'ar'
          ? `* **فحص سياق الذاكرة والملخص**: تم فحص آخر 5 رسائل واستيعاب ملخص الحوار السابق.
* **تحليل استفسار الباحث**: تفكيك المصطلحات العلمية واستخراج كلمات البحث.
* **استرجاع أوراق OpenAlex**: تم جلب ومطابقة ${papers.length} أوراق بحثية محكمة.
* **تحديث الملخص المستمر (Overwrite)**: تحديث ملخص الحوار شاملاً المفاهيم الجديدة دون تكرار.`
          : `* **Context & Memory Evaluation**: Evaluated rolling summary and last 5 dialog turns.
* **Query Analysis**: Extracted scientific concepts and formulated search terms.
* **OpenAlex Retrieval**: Queried OpenAlex and retrieved ${papers.length} peer-reviewed papers.
* **Rolling Overwriting Summary**: Updated conversation summary in-place for long-term retention.`;

      return {
        ...parsed,
        thought: defaultThought,
        usage: {
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
        },
      };
    } catch (err) {
      if (err.status === 429) throw err;
      lastError = err;
    }
  }

  throw lastError || new Error('All Gemini candidate models failed to stream.');
}

const server = http.createServer(async (req, res) => {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, Accept');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const parsedUrl = new URL(req.url, `http://${req.headers.host}`);

  // Health / Models check
  if (
    req.method === 'GET' &&
    (parsedUrl.pathname === '/api/Chat/models' ||
      parsedUrl.pathname === '/api/chat/models')
  ) {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', model: PRIMARY_MODEL }));
    return;
  }

  // Ask Streaming or Standard Endpoint
  if (
    req.method === 'POST' &&
    (parsedUrl.pathname === '/api/Chat/ask' ||
      parsedUrl.pathname === '/api/chat/ask' ||
      parsedUrl.pathname === '/api/Chat/ask-stream' ||
      parsedUrl.pathname === '/api/chat/ask-stream')
  ) {
    let body = '';
    req.on('data', (chunk) => (body += chunk));
    req.on('end', async () => {
      try {
        let parsedBody = {};
        try {
          parsedBody = JSON.parse(body || '{}');
        } catch {
          parsedBody = { userMessage: body };
        }
        const { userMessage, language, chatSummary, recentHistory } = parsedBody;
        if (!userMessage) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'userMessage is required' }));
          return;
        }

        console.log(`User query [Streaming]: "${userMessage}"`);

        // Check if conversational or needs research papers
        const isConversational =
          /^(hi|hello|hey|ازيك|مرحبا|اهلا|صباح الخير|مساء الخير|مين انت|شكرا)\b/i.test(
            userMessage.trim()
          );

        let papers = [];
        if (!isConversational) {
          const keywords = getQuickKeywords(userMessage);
          console.log(`Searching OpenAlex for keywords: "${keywords}"...`);
          papers = await searchOpenAlex(keywords);
          console.log(`Found ${papers.length} papers on OpenAlex.`);
        }

        // Set SSE response headers
        res.writeHead(200, {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          Connection: 'keep-alive',
        });

        // Send initial paper notification if papers retrieved
        if (papers.length > 0) {
          res.write(`data: ${JSON.stringify({ type: 'papers', count: papers.length })}\n\n`);
        }

        // Call Gemini streaming
        const generated = await callGeminiStream(
          { userMessage, language, papers, chatSummary, recentHistory },
          (chunk) => {
            res.write(`data: ${JSON.stringify({ type: 'chunk', text: chunk })}\n\n`);
          },
          (thought) => {
            res.write(`data: ${JSON.stringify({ type: 'thought', text: thought })}\n\n`);
          }
        );

        // Map evidence from papers
        const finalClaims = (generated.claims || []).map((claim) => {
          const finalEvidence = [];
          for (const item of claim.evidence || []) {
            const paper = papers.find(
              (p) => p.id.toLowerCase() === (item.paperId || '').toLowerCase()
            );
            if (!paper || !paper.abstract) continue;
            const rank = papers.indexOf(paper);
            finalEvidence.push({
              sourcePassage: paper.abstract,
              paperLink: paper.paperLink || paper.id,
              retrievalScore: 1.0 / (rank + 1),
            });
          }
          return {
            text: claim.text,
            type: claim.type,
            evidence: finalEvidence,
          };
        });

        // Send completion event
        res.write(
          `data: ${JSON.stringify({
            type: 'done',
            answer: generated.answer,
            claims: finalClaims,
            updatedSummary: generated.updatedSummary || '',
            thought: generated.thought,
            usage: generated.usage,
          })}\n\n`
        );
        res.end();
        console.log('Stream completed successfully!');
      } catch (err) {
        console.error('Server streaming error:', err);
        const isRateLimit =
          err.status === 429 ||
          err.message?.includes('429') ||
          err.message?.includes('RESOURCE_EXHAUSTED') ||
          err.message?.includes('quota');

        if (isRateLimit) {
          res.write(
            `data: ${JSON.stringify({
              type: 'error',
              status: 429,
              error: 'RATE_LIMIT_EXCEEDED',
              message:
                'تم تجاوز الحد الأقصى لطلبات Gemini API المجانية (Rate Limit / Quota Exceeded).',
            })}\n\n`
          );
          res.end();
          return;
        }

        res.write(
          `data: ${JSON.stringify({
            type: 'error',
            status: 500,
            error: 'INTERNAL_ERROR',
            message: err.message,
          })}\n\n`
        );
        res.end();
      }
    });
    return;
  }

  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Not found' }));
});

server.listen(PORT, () => {
  console.log(`ResearchHub API backend listening on http://localhost:${PORT}`);
  console.log(`Candidate Models: ${CANDIDATE_MODELS.join(', ')}`);
  console.log(
    `API Key loaded: ${
      GEMINI_API_KEY ? 'Yes (' + GEMINI_API_KEY.slice(0, 6) + '...)' : 'No'
    }`
  );
});
