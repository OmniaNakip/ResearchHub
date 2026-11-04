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
                throw new InvalidOperationException(
                    "Gemini API Key is not configured.");

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

        public async Task<string> GetAiResponseAsync(
            string userMessage,
            string language,
            List<ResearchPaper> papers)
        {
            string? apiKey = _configuration["Gemini:ApiKey"];
            string? model = _configuration["Gemini:Model"];

            if (string.IsNullOrWhiteSpace(apiKey))
                throw new InvalidOperationException(
                    "Gemini API Key is not configured.");

            if (string.IsNullOrWhiteSpace(model))
                throw new InvalidOperationException(
                    "Gemini model is not configured.");

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
    You are an academic research assistant.

    Answer in {{language}}.
    Use clear and simple language.

    Student question:
    {{userMessage}}

    Retrieved academic papers from OpenAlex:
    {{papersContext}}

    Instructions:
    1. Answer using only the provided research papers.
    2. Do not invent facts or use external sources.
    3. If the papers do not provide enough information, mention that.
    4. Return valid JSON only, without Markdown code fences.
    5. Create separate claims.
    6. For each claim, select the IDs of papers that support it.
    7. Only use Paper IDs that exist in the provided papers.
    8. Do not generate source passages, paper links, or retrieval scores.

    Required JSON structure:
    {
        "answer": "Your complete answer",
        "claims": [
            {
                "text": "A specific claim",
                "type": "Research finding",
                "evidence": [
                    {
                        "paperId": "Exact ID from the provided papers"
                    }
                ]
            }
        ]
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

            using var request = new HttpRequestMessage(
                HttpMethod.Post,
                url);

            request.Headers.Add("x-goog-api-key", apiKey);

            request.Content = new StringContent(
                JsonSerializer.Serialize(requestBody),
                Encoding.UTF8,
                "application/json");

            using var response = await _httpClient.SendAsync(request);

            string responseContent =
                await response.Content.ReadAsStringAsync();

            if (!response.IsSuccessStatusCode)
            {
                throw new HttpRequestException(
                    $"Gemini API failed: {(int)response.StatusCode}. {responseContent}",
                    null,
                    response.StatusCode);
            }

            using var document = JsonDocument.Parse(responseContent);

            var candidates = document.RootElement.GetProperty("candidates");

            if (candidates.GetArrayLength() == 0)
                throw new InvalidOperationException(
                    "Gemini returned no answer.");

            string? answer = candidates[0]
                .GetProperty("content")
                .GetProperty("parts")[0]
                .GetProperty("text")
                .GetString();

            if (string.IsNullOrWhiteSpace(answer))
                throw new InvalidOperationException(
                    "Gemini returned an empty answer.");

            return answer;
        }
    }
}