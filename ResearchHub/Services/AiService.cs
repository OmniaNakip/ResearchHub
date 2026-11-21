
using System.Net.Http;
using System.Text;
using System.Text.Json;
using Microsoft.Extensions.Configuration;
using ResearchHub.Models;

namespace ResearchHub.Services
{
    public class AiService : IAiService
    {
        private readonly HttpClient _httpClient;
        private readonly IConfiguration _configuration;

        public AiService(
            HttpClient httpClient,
            IConfiguration configuration)
        {
            _httpClient = httpClient;
            _configuration = configuration;
        }

        public async Task<string> GetAvailableModelsAsync()
        {
            string? apiKey = _configuration["Gemini:ApiKey"];

            if (string.IsNullOrWhiteSpace(apiKey))
            {
                throw new InvalidOperationException(
                    "Gemini API Key is not configured.");
            }

            using var request = new HttpRequestMessage(
                HttpMethod.Get,
                "https://generativelanguage.googleapis.com/v1beta/models");

            request.Headers.Add("x-goog-api-key", apiKey);

            using var response = await _httpClient.SendAsync(request);

            string responseContent =
                await response.Content.ReadAsStringAsync();

            if (!response.IsSuccessStatusCode)
            {
                throw new HttpRequestException(
                    $"Gemini API failed: {(int)response.StatusCode}. {responseContent}");
            }

            return responseContent;
        }



        public async Task<string> GetEnglishSearchQueryAsync(string userMessage)
        {
            string? apiKey = _configuration["Gemini:ApiKey"];
            string? model = _configuration["Gemini:Model"];

            if (string.IsNullOrWhiteSpace(apiKey))
                throw new InvalidOperationException(
                    "Gemini API Key is not configured.");

            if (string.IsNullOrWhiteSpace(model))
                throw new InvalidOperationException(
                    "Gemini model is not configured.");

            string prompt = $$"""
You are an academic search query translator.

Convert the following research question into a concise English
academic search query suitable for searching OpenAlex.

Rules:
1. Translate Arabic or other non-English text into English.
2. Preserve the original scientific meaning.
3. Keep important technical terms, diseases, methods, and technologies.
4. Use relevant academic keywords and synonyms when useful.
5. Do not answer the research question.
6. Do not add explanations or introductions.
7. Return ONLY the English search query.

Research question:
{{userMessage}}
""";

            var requestBody = new
            {
                contents = new[]
                {
            new
            {
                parts = new[]
                {
                    new { text = prompt }
                }
            }
        },
                generationConfig = new
                {
                    temperature = 0.1
                }
            };

            string url =
                $"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent";

            string requestJson = JsonSerializer.Serialize(requestBody);

            string responseContent = string.Empty;

            for (int attempt = 1; attempt <= 4; attempt++)
            {
                using var request = new HttpRequestMessage(
                    HttpMethod.Post,
                    url);

                request.Headers.Add("x-goog-api-key", apiKey);

                request.Content = new StringContent(
                    requestJson,
                    Encoding.UTF8,
                    "application/json");

                using var response = await _httpClient.SendAsync(request);

                responseContent = await response.Content.ReadAsStringAsync();

                if (response.IsSuccessStatusCode)
                    break;

                int statusCode = (int)response.StatusCode;

                bool isTemporaryError =
                    statusCode == 429 ||
                    statusCode == 500 ||
                    statusCode == 502 ||
                    statusCode == 503 ||
                    statusCode == 504;

                if (!isTemporaryError || attempt == 4)
                {
                    throw new HttpRequestException(
                        $"Gemini search translation failed: {statusCode}. {responseContent}",
                        null,
                        response.StatusCode);
                }

                await Task.Delay(
                    TimeSpan.FromSeconds(Math.Pow(2, attempt - 1)));
            }

            using var document = JsonDocument.Parse(responseContent);

            if (!document.RootElement.TryGetProperty(
                    "candidates", out var candidates) ||
                candidates.ValueKind != JsonValueKind.Array ||
                candidates.GetArrayLength() == 0)
            {
                throw new InvalidOperationException(
                    "Gemini returned no search query.");
            }

            var firstCandidate = candidates[0];

            if (!firstCandidate.TryGetProperty(
                    "content", out var content) ||
                !content.TryGetProperty(
                    "parts", out var parts) ||
                parts.ValueKind != JsonValueKind.Array ||
                parts.GetArrayLength() == 0 ||
                !parts[0].TryGetProperty(
                    "text", out var textElement))
            {
                throw new InvalidOperationException(
                    "Gemini returned an invalid search query response.");
            }

            string? searchQuery = textElement.GetString();

            if (string.IsNullOrWhiteSpace(searchQuery))
            {
                throw new InvalidOperationException(
                    "Gemini returned an empty search query.");
            }

            return searchQuery
                .Replace("```text", "")
                .Replace("```", "")
                .Trim()
                .Trim('"');
        }

        public async Task<string> GetAiResponseAsync(
            string userMessage,
            string language,
            List<ResearchPaper> papers)
        {
            string? apiKey = _configuration["Gemini:ApiKey"];
            string? model = _configuration["Gemini:Model"];

            if (string.IsNullOrWhiteSpace(apiKey))
            {
                throw new InvalidOperationException(
                    "Gemini API Key is not configured.");
            }

            if (string.IsNullOrWhiteSpace(model))
            {
                throw new InvalidOperationException(
                    "Gemini model is not configured.");
            }

            string papersContext = JsonSerializer.Serialize(
                papers.Select(p => new
                {
                    p.Id,
                    p.Title,
                    p.Authors,
                    p.PublicationYear,
                    p.Abstract,
                    p.Doi,
                    p.PaperLink
                }),
                new JsonSerializerOptions
                {
                    WriteIndented = true
                });

            string prompt = $$"""
You are an academic research assistant for undergraduate students.

Your main purpose is to help students with academic research.

Answer in {{language}}.
Use clear and simple language.

Student question:
{{userMessage}}

Retrieved academic papers from OpenAlex:
{{papersContext}}

Instructions:

1. Determine whether the student's question is related to academic research.

2. This assistant only supports:
   - Academic research questions.
   - Literature discovery.
   - Research paper analysis.
   - Comparison of academic studies.
   - Research gaps and future research opportunities.
   - Academic research briefs.

3. If the question is unrelated to academic research:
   - Set "isInScope" to false.
   - Politely explain that you can only help with academic research.
   - Do not generate claims.
   - Return an empty claims array.

4. If the question is related to academic research:
   - Set "isInScope" to true.
   - Answer using only the supplied academic papers.
   - If the papers do not provide enough information, clearly explain this limitation.

5. Never invent papers, authors, citations, findings, experiments, or quotations.

6. Create separate and specific claims.

7. Every claim must have exactly one of these types:

   - "Source-supported": A claim directly supported by information in one or more supplied paper abstracts.
   - "AI interpretation": An explanation or interpretation based on the retrieved papers, not a direct statement from a source.
   - "AI recommendation": A suggestion intended to help the student explore or improve their research.
   - "Unverified hypothesis": A possible explanation or research gap that is not established by the supplied evidence.

8. Only Source-supported claims may contain evidence.

9. For every Source-supported claim:
   - Use the exact Paper ID from the supplied papers.
   - Only include papers that directly support the claim.
   - Do not create source passages, paper links, or retrieval scores.

10. For AI interpretation, AI recommendation, and Unverified hypothesis:
    - Return an empty evidence array.

11. Do not claim that a paper proves something unless its supplied abstract supports that statement.

12. Do not present recommendations or hypotheses as established research findings.

13. If the research question is unclear, politely ask the student to clarify it.

14. Do not answer unrelated questions even if they are simple general knowledge questions.

15. Return valid JSON only.
    Do not use Markdown code fences.
    Do not add explanations outside the JSON object.

Required JSON structure:

{
    "isInScope": true,
    "answer": "Your complete answer",
    "claims": [
        {
            "text": "A specific claim",
            "type": "Source-supported",
            "evidence": [
                {
                    "paperId": "Exact ID from the supplied papers"
                }
            ]
        }
    ]
}

For an unrelated question, return:

{
    "isInScope": false,
    "answer": "I can only help with academic research. Please enter an academic research question.",
    "claims": []
}
""";

            var requestBody = new
            {
                contents = new[]
                {
                    new
                    {
                        parts = new[]
                        {
                            new { text = prompt }
                        }
                    }
                },
                generationConfig = new
                {
                    responseMimeType = "application/json"
                }
            };

            string url =
                $"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent";

            string requestJson = JsonSerializer.Serialize(requestBody);

            string responseContent = "";

            // Initial request + 3 retries
            for (int attempt = 1; attempt <= 4; attempt++)
            {
                using var request = new HttpRequestMessage(
                    HttpMethod.Post,
                    url);

                request.Headers.Add("x-goog-api-key", apiKey);

                request.Content = new StringContent(
                    requestJson,
                    Encoding.UTF8,
                    "application/json");

                using var response = await _httpClient.SendAsync(request);

                responseContent =
                    await response.Content.ReadAsStringAsync();

                if (response.IsSuccessStatusCode)
                    break;

                int statusCode = (int)response.StatusCode;

                bool isTemporaryError =
                    statusCode == 429 ||
                    statusCode == 500 ||
                    statusCode == 502 ||
                    statusCode == 503 ||
                    statusCode == 504;

                if (!isTemporaryError || attempt == 4)
                {
                    throw new HttpRequestException(
                        $"Gemini API failed: {statusCode}. {responseContent}",
                        null,
                        response.StatusCode);
                }

                // Wait 1, 2, then 4 seconds before retrying
                int delaySeconds = (int)Math.Pow(2, attempt - 1);

                await Task.Delay(TimeSpan.FromSeconds(delaySeconds));
            }

            using var document = JsonDocument.Parse(responseContent);

            if (!document.RootElement.TryGetProperty(
                    "candidates", out var candidates) ||
                candidates.ValueKind != JsonValueKind.Array ||
                candidates.GetArrayLength() == 0)
            {
                throw new InvalidOperationException(
                    "Gemini returned no answer.");
            }

            var firstCandidate = candidates[0];

            if (!firstCandidate.TryGetProperty(
                    "content", out var content) ||
                !content.TryGetProperty(
                    "parts", out var parts) ||
                parts.ValueKind != JsonValueKind.Array ||
                parts.GetArrayLength() == 0 ||
                !parts[0].TryGetProperty(
                    "text", out var textElement))
            {
                throw new InvalidOperationException(
                    "Gemini returned an invalid response structure.");
            }

            string? answer = textElement.GetString();

            if (string.IsNullOrWhiteSpace(answer))
            {
                throw new InvalidOperationException(
                    "Gemini returned an empty answer.");
            }

            return answer;
        }
    }
}
