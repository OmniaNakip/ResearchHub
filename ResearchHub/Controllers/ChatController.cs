using Microsoft.AspNetCore.Mvc;
using ResearchHub.Models;
using ResearchHub.Services;
using System.Text.Json;
using System.Net;

namespace ResearchHub.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    public class ChatController : ControllerBase
    {
        private readonly IAiService _aiService;
        private readonly OpenAlexService _openAlexService;
        private readonly ILogger<ChatController> _logger;

        public ChatController(
            IAiService aiService,
            OpenAlexService openAlexService,
            ILogger<ChatController> logger)
        {
            _aiService = aiService;
            _openAlexService = openAlexService;
            _logger = logger;
        }

        [HttpPost("ask")]
        public async Task<IActionResult> Ask([FromBody] ChatRequest request)
        {
            try
            {
                // 1. Retrieve papers from OpenAlex
                List<ResearchPaper> papers =
                    await _openAlexService.SearchPapersAsync(request.UserMessage);

                if (papers == null || papers.Count == 0)
                {
                    return Ok(new ChatResponse
                    {
                        Answer = "No relevant academic papers were found.",
                        Claims = new List<ClaimResponse>()
                    });
                }

                // 2. Get Gemini's answer and selected paper IDs
                string aiResponse = await _aiService.GetAiResponseAsync(
                    request.UserMessage,
                    request.Language,
                    papers);

                var generatedResponse =
                    JsonSerializer.Deserialize<AiGeneratedResponse>(
                        aiResponse,
                        new JsonSerializerOptions
                        {
                            PropertyNameCaseInsensitive = true
                        });

                if (generatedResponse == null)
                    return StatusCode(502, "Invalid AI response.");

                // 3. Build evidence using OpenAlex data, not Gemini-generated data
                var finalClaims = new List<ClaimResponse>();

                foreach (var claim in generatedResponse.Claims)
                {
                    var finalEvidence = new List<EvidenceResponse>();

                    foreach (var item in claim.Evidence)
                    {
                        var paper = papers.FirstOrDefault(p =>
                            string.Equals(
                                p.Id,
                                item.PaperId,
                                StringComparison.OrdinalIgnoreCase));

                        // Reject IDs that were not returned by OpenAlex
                        if (paper == null)
                            continue;

                        // Do not create evidence without an actual abstract
                        if (string.IsNullOrWhiteSpace(paper.Abstract))
                            continue;

                        int paperRank = papers.IndexOf(paper);

                        finalEvidence.Add(new EvidenceResponse
                        {
                            SourcePassage = paper.Abstract,
                            PaperLink = !string.IsNullOrWhiteSpace(paper.PaperLink)
                                ? paper.PaperLink
                                : paper.Id,

                            // Reciprocal rank: score based on OpenAlex result order
                            RetrievalScore = 1.0 / (paperRank + 1)
                        });
                    }

                    finalClaims.Add(new ClaimResponse
                    {
                        Text = claim.Text,
                        Type = claim.Type,
                        Evidence = finalEvidence
                    });
                }

                // 4. Return the final response
                return Ok(new ChatResponse
                {
                    Answer = generatedResponse.Answer,
                    Claims = finalClaims
                });
            }
            catch (HttpRequestException ex)
            {
                _logger.LogError(ex, "External API request failed.");

                // Explicitly detect 429 Too Many Requests / Resource Exhausted
                if (ex.StatusCode == HttpStatusCode.TooManyRequests ||
                    (ex.Message != null && (ex.Message.Contains("429") || ex.Message.Contains("RESOURCE_EXHAUSTED") || ex.Message.Contains("quota"))))
                {
                    return StatusCode(429, new
                    {
                        error = "RATE_LIMIT_EXCEEDED",
                        message = "Gemini API rate limit has been exceeded. Please wait a moment before trying again."
                    });
                }

                return StatusCode(502, new
                {
                    error = "EXTERNAL_API_ERROR",
                    message = "An external API request failed.",
                    details = ex.Message
                });
            }
            catch (JsonException ex)
            {
                _logger.LogError(ex, "Invalid JSON response from AI.");
                return StatusCode(502, "The AI returned an invalid response.");
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "An unexpected error occurred.");
                return StatusCode(500, "An unexpected server error occurred.");
            }
        }

        [HttpGet("search-papers")]
        public async Task<IActionResult> SearchPapers(
            [FromQuery] string query)
        {
            if (string.IsNullOrWhiteSpace(query))
                return BadRequest("Search query is required.");

            try
            {
                var papers =
                    await _openAlexService.SearchPapersAsync(query);

                return Ok(papers);
            }
            catch (HttpRequestException ex)
            {
                _logger.LogError(ex, "OpenAlex search failed.");

                return StatusCode(502, new
                {
                    message = "Could not retrieve research papers.",
                    details = ex.Message
                });
            }
        }

        [HttpGet("models")]
        public async Task<IActionResult> GetAvailableModels()
        {
            try
            {
                string models =
                    await _aiService.GetAvailableModelsAsync();

                return Content(models, "application/json");
            }
            catch (HttpRequestException ex)
            {
                _logger.LogError(ex, "Failed to retrieve Gemini models.");

                if (ex.StatusCode == HttpStatusCode.TooManyRequests ||
                    (ex.Message != null && (ex.Message.Contains("429") || ex.Message.Contains("RESOURCE_EXHAUSTED"))))
                {
                    return StatusCode(429, new
                    {
                        error = "RATE_LIMIT_EXCEEDED",
                        message = "Gemini API rate limit has been exceeded."
                    });
                }

                return StatusCode(502, new
                {
                    message = "Could not connect to Gemini.",
                    details = ex.Message
                });
            }
        }
    }
}
