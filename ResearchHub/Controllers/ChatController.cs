
using Microsoft.AspNetCore.Mvc;
using ResearchHub.Models;
using ResearchHub.Services;
using System.Text.Json;

namespace ResearchHub.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    public class ChatController : ControllerBase
    {
        private readonly IAiService _aiService;
        private readonly OpenAlexService _openAlexService;
        private readonly ILogger<ChatController> _logger;

        private static readonly string[] AllowedClaimTypes =
        {
            "Source-supported",
            "AI interpretation",
            "AI recommendation",
            "Unverified hypothesis"
        };

        public ChatController(
            IAiService aiService,
            OpenAlexService openAlexService,
            ILogger<ChatController> logger)
        {
            _aiService = aiService;
            _openAlexService = openAlexService;
            _logger = logger;
        }

        [HttpGet("welcome")]
        public IActionResult Welcome()
        {
            return Ok(new ChatResponse
            {
                Answer = "Welcome to Research Hub! I'm your academic research assistant. I can help you explore research topics, discover academic papers, and understand scientific findings. I use academic papers retrieved from OpenAlex. My answers may contain AI interpretations and recommendations, so always verify important claims using the provided evidence and consult your supervisor or librarian when needed. What would you like to research today?",
                Claims = new List<ClaimResponse>()
            });
        }


        [HttpPost("ask")]

        public async Task<IActionResult> Ask([FromBody] ChatRequest request)
        {
            try
            {
                // 1. Validate the incoming request
                if (request == null ||
                    string.IsNullOrWhiteSpace(request.UserMessage))
                {
                    return BadRequest(new
                    {
                        message = "Please enter a research question."
                    });
                }

                if (string.IsNullOrWhiteSpace(request.Language))
                {
                    request.Language = "English";
                }

                // 2. Translate Arabic research questions into English
                // before searching OpenAlex
                string searchQuery = request.UserMessage;

                if (ContainsArabic(request.UserMessage))
                {
                    searchQuery = await _aiService.GetEnglishSearchQueryAsync(
                        request.UserMessage);
                }

                // 3. Retrieve academic papers from OpenAlex
                List<ResearchPaper> papers =
                    await _openAlexService.SearchPapersAsync(searchQuery);

                if (papers == null || papers.Count == 0)
                {
                    return Ok(new ChatResponse
                    {
                        Answer = "I couldn't find relevant academic papers for your question. Please try rephrasing your research question or using more specific academic keywords.",
                        Claims = new List<ClaimResponse>()
                    });
                }

                // 4. Check whether abstracts are available
                if (papers.All(p =>
                    string.IsNullOrWhiteSpace(p.Abstract)))
                {
                    return Ok(new ChatResponse
                    {
                        Answer = "I found academic papers related to your question, but their abstracts are unavailable. I cannot provide evidence-based analysis without accessible source content. Please try another research query or select papers with available abstracts.",
                        Claims = new List<ClaimResponse>()
                    });
                }

                // 5. Generate AI response using Gemini
                // Keep the original research question here
                string aiResponse = await _aiService.GetAiResponseAsync(
                    request.UserMessage,
                    request.Language,
                    papers);

                // 6. Parse Gemini JSON response
                AiGeneratedResponse? generatedResponse =
                    JsonSerializer.Deserialize<AiGeneratedResponse>(
                        aiResponse,
                        new JsonSerializerOptions
                        {
                            PropertyNameCaseInsensitive = true
                        });

                if (generatedResponse == null ||
                    string.IsNullOrWhiteSpace(generatedResponse.Answer))
                {
                    return StatusCode(502, new
                    {
                        message = "The AI returned an invalid response. Please try again."
                    });
                }

                // 7. Handle questions outside academic research scope
                if (!generatedResponse.IsInScope)
                {
                    return Ok(new ChatResponse
                    {
                        Answer = generatedResponse.Answer,
                        Claims = new List<ClaimResponse>()
                    });
                }

                // 8. Convert AI claims into response claims
                var validatedResponse = new ChatResponse
                {
                    Answer = generatedResponse.Answer,

                    Claims = (generatedResponse.Claims ?? new())
                        .Where(c => !string.IsNullOrWhiteSpace(c.Text))
                        .Select(c => new ClaimResponse
                        {
                            Text = c.Text,
                            Type = c.Type,

                            Evidence = (c.Evidence ?? new())
                                .Select(e => new EvidenceResponse
                                {
                                    PaperId = e.PaperId
                                })
                                .ToList()
                        })
                        .ToList()
                };

                // 9. Validate claim types and enrich evidence
                ValidateAndEnrichClaims(validatedResponse, papers);

                // 10. Return the final response
                return Ok(new ChatResponse
                {
                    Answer = validatedResponse.Answer,
                    Claims = validatedResponse.Claims
                });
            }
            catch (HttpRequestException ex)
            {
                _logger.LogError(ex, "External API request failed in Ask.");

                return StatusCode(502, new
                {
                    message = "An external research or AI service is currently unavailable. Please try again later."
                });
            }
            catch (TaskCanceledException ex)
            {
                _logger.LogError(ex, "Ask request timed out.");

                return StatusCode(504, new
                {
                    message = "The request took too long. Please try again."
                });
            }
            catch (JsonException ex)
            {
                _logger.LogError(ex, "Invalid JSON response in Ask.");

                return StatusCode(502, new
                {
                    message = "The AI returned an invalid response. Please try again."
                });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Unexpected error in Ask.");

                return StatusCode(500, new
                {
                    message = "An unexpected server error occurred."
                });
            }
        }






        [HttpPost("workflow")]
        public async Task<IActionResult> Workflow([FromBody] WorkflowRequest request)
        {
            try
            {
                string[] stages =
                {
            "Onboarding",
            "ResearchQuestion",
            "PaperDiscovery",
            "PaperAnalysis",
            "ComparisonAndGaps",
            "ResearchBrief",
            "Completed"
        };

                if (request == null)
                {
                    return BadRequest(new
                    {
                        message = "Request is required."
                    });
                }

                if (string.IsNullOrWhiteSpace(request.CurrentStage) ||
                    string.IsNullOrWhiteSpace(request.Action))
                {
                    return BadRequest(new
                    {
                        message = "CurrentStage and Action are required."
                    });
                }

                int index = Array.FindIndex(
                    stages,
                    s => s.Equals(
                        request.CurrentStage.Trim(),
                        StringComparison.OrdinalIgnoreCase));

                if (index < 0)
                {
                    return BadRequest(new
                    {
                        message = "Invalid workflow stage."
                    });
                }

                string currentStage = stages[index];
                string action = request.Action.Trim();

                string nextStage = currentStage;
                string answer = string.Empty;
                string researchBrief = string.Empty;

                var discoveredPapers = new List<ResearchPaper>();

                // Restore previous analysis/comparison sent by the client.
                ChatResponse? analysis = request.PreviousAnalysis;

                var selectedPaperIds = (request.SelectedPaperIds ?? new List<string>())
                    .Where(id => !string.IsNullOrWhiteSpace(id))
                    .Select(id => id.Trim())
                    .Distinct(StringComparer.OrdinalIgnoreCase)
                    .ToList();

                // Safely parse Gemini JSON response.
                ChatResponse? ParseAiResponse(string result)
                {
                    if (string.IsNullOrWhiteSpace(result))
                        return null;

                    result = result.Trim();

                    if (result.StartsWith("```"))
                    {
                        int firstLine = result.IndexOf('\n');

                        if (firstLine >= 0)
                            result = result.Substring(firstLine + 1);

                        int lastFence = result.LastIndexOf("```");

                        if (lastFence >= 0)
                            result = result.Substring(0, lastFence);
                    }

                    int start = result.IndexOf('{');
                    int end = result.LastIndexOf('}');

                    if (start < 0 || end <= start)
                        return null;

                    result = result.Substring(start, end - start + 1);

                    try
                    {
                        var parsed = JsonSerializer.Deserialize<ChatResponse>(
                            result,
                            new JsonSerializerOptions
                            {
                                PropertyNameCaseInsensitive = true
                            });

                        if (parsed == null)
                            return null;

                        parsed.Answer ??= string.Empty;
                        parsed.Claims ??= new List<ClaimResponse>();

                        foreach (var claim in parsed.Claims)
                        {
                            claim.Text ??= string.Empty;
                            claim.Type ??= "Unverified hypothesis";
                            claim.Evidence ??= new List<EvidenceResponse>();
                            claim.CitationCheckStatus = "Not checked";
                        }

                        return parsed;
                    }
                    catch (JsonException)
                    {
                        return null;
                    }
                }

                // 1. Go back to the previous stage.
                if (action.Equals("Back", StringComparison.OrdinalIgnoreCase))
                {
                    if (index == 0)
                    {
                        return BadRequest(new
                        {
                            message = "Already at the first stage."
                        });
                    }

                    nextStage = stages[index - 1];
                    answer = "You returned to the previous stage.";
                }

                // 2. Start workflow.
                else if (action.Equals("Start", StringComparison.OrdinalIgnoreCase)
                         && currentStage == "Onboarding")
                {
                    nextStage = "ResearchQuestion";
                    answer = "What research topic are you interested in?";
                }

                // 3. Discover academic papers.
                else if (action.Equals("Discover", StringComparison.OrdinalIgnoreCase)
                         && currentStage == "PaperDiscovery")
                {
                    if (string.IsNullOrWhiteSpace(request.ResearchQuestion))
                    {
                        return BadRequest(new
                        {
                            message = "Research question is required."
                        });
                    }

                    // Translate Arabic research questions into English
                    // before searching OpenAlex.
                    string searchQuery = request.ResearchQuestion;

                    if (ContainsArabic(request.ResearchQuestion))
                    {
                        searchQuery = await _aiService.GetEnglishSearchQueryAsync(
                            request.ResearchQuestion);
                    }

                    // Search OpenAlex using the prepared search query.
                    discoveredPapers =
                        await _openAlexService.SearchPapersAsync(searchQuery);

                    if (discoveredPapers == null || discoveredPapers.Count == 0)
                    {
                        answer = "No relevant academic papers were found. Please try different research keywords.";
                    }
                    else
                    {
                        answer = $"Found {discoveredPapers.Count} academic papers. Review them and select the papers you want to analyze.";
                    }

                    nextStage = "PaperDiscovery";
                }

                // 4. Analyze selected papers.
                else if (action.Equals("Analyze", StringComparison.OrdinalIgnoreCase)
                         && currentStage == "PaperAnalysis")
                {
                    if (string.IsNullOrWhiteSpace(request.ResearchQuestion))
                    {
                        return BadRequest(new
                        {
                            message = "Research question is required."
                        });
                    }

                    if (selectedPaperIds.Count == 0)
                    {
                        return BadRequest(new
                        {
                            message = "Select at least one paper."
                        });
                    }

                    discoveredPapers =
                        await _openAlexService.GetPapersByIdsAsync(
                            selectedPaperIds);

                    if (discoveredPapers == null || discoveredPapers.Count == 0)
                    {
                        return BadRequest(new
                        {
                            message = "No selected papers could be retrieved from OpenAlex."
                        });
                    }

                    if (discoveredPapers.All(p =>
                        string.IsNullOrWhiteSpace(p.Abstract)))
                    {
                        return Ok(new WorkflowResponse
                        {
                            Answer = "The selected papers do not contain accessible abstracts. Please select papers with available abstracts.",
                            CurrentStage = "PaperAnalysis",
                            NextStage = "PaperAnalysis",
                            RequiresApproval = true,
                            AvailableActions = new List<string>
                    {
                        "Analyze",
                        "Back"
                    },
                            ResearchQuestion = request.ResearchQuestion,
                            SelectedPaperIds = selectedPaperIds,
                            Papers = discoveredPapers
                        });
                    }

                    string analysisPrompt =
                        "You are an academic research assistant. Analyze the selected papers " +
                        "in relation to this research question: " +
                        request.ResearchQuestion + ". " +

                        "For each paper, discuss its objective, methodology, findings, and limitations " +
                        "ONLY when this information is available in the supplied paper data. " +

                        "Do not invent experiments, datasets, numerical results, methodologies, " +
                        "authors, citations, or limitations. Clearly state when information is unavailable. " +

                        "Create concise claims. Each claim must have a type chosen from: " +
                        "Source-supported, AI interpretation, AI recommendation, Unverified hypothesis. " +

                        "Only Source-supported claims may contain evidence. " +
                        "For evidence, use the exact paper ID from the supplied papers. " +
                        "Do not create source passages or links. " +

                        "Return ONLY valid JSON with this structure: " +
                        "{\"answer\":\"...\",\"claims\":[{\"text\":\"...\",\"type\":\"Source-supported\"," +
                        "\"evidence\":[{\"paperId\":\"exact paper ID\"}]}]}. " +

                        "Selected papers: " +
                        JsonSerializer.Serialize(discoveredPapers);

                    string aiResult = await _aiService.GetAiResponseAsync(
                        analysisPrompt,
                        "English",
                        discoveredPapers);

                    analysis = ParseAiResponse(aiResult);

                    if (analysis == null)
                    {
                        return StatusCode(502, new
                        {
                            message = "The AI service returned an invalid analysis response."
                        });
                    }

                    ValidateAndEnrichClaims(analysis, discoveredPapers);

                    return Ok(new WorkflowResponse
                    {
                        Answer = analysis.Answer,
                        CurrentStage = "PaperAnalysis",
                        NextStage = "ComparisonAndGaps",
                        RequiresApproval = true,
                        AvailableActions = new List<string>
                {
                    "Compare",
                    "Back"
                },
                        ResearchQuestion = request.ResearchQuestion,
                        SelectedPaperIds = selectedPaperIds,
                        Papers = discoveredPapers,
                        Analysis = analysis
                    });
                }

                // 5. Compare papers and identify research gaps.
                else if (action.Equals("Compare", StringComparison.OrdinalIgnoreCase)
                         && currentStage == "ComparisonAndGaps")
                {
                    if (string.IsNullOrWhiteSpace(request.ResearchQuestion))
                    {
                        return BadRequest(new
                        {
                            message = "Research question is required."
                        });
                    }

                    if (selectedPaperIds.Count == 0)
                    {
                        return BadRequest(new
                        {
                            message = "Selected papers are required."
                        });
                    }

                    discoveredPapers =
                        await _openAlexService.GetPapersByIdsAsync(
                            selectedPaperIds);

                    if (discoveredPapers == null || discoveredPapers.Count == 0)
                    {
                        return BadRequest(new
                        {
                            message = "No selected papers could be retrieved from OpenAlex."
                        });
                    }

                    if (discoveredPapers.All(p =>
                        string.IsNullOrWhiteSpace(p.Abstract)))
                    {
                        return Ok(new WorkflowResponse
                        {
                            Answer = "The selected papers do not contain accessible abstracts. Comparison cannot be performed.",
                            CurrentStage = "ComparisonAndGaps",
                            NextStage = "ComparisonAndGaps",
                            RequiresApproval = true,
                            AvailableActions = new List<string>
                    {
                        "Compare",
                        "Back"
                    },
                            ResearchQuestion = request.ResearchQuestion,
                            SelectedPaperIds = selectedPaperIds,
                            Papers = discoveredPapers,
                            Analysis = analysis
                        });
                    }

                    string comparisonPrompt =
                        "You are an academic research assistant. Compare the supplied papers " +
                        "in relation to this research question: " +
                        request.ResearchQuestion + ". " +

                        "Number of supplied papers: " + discoveredPapers.Count + ". " +

                        "If only one paper is supplied, explicitly state that a comparison between " +
                        "multiple studies is not possible. Do not invent similarities or differences " +
                        "between studies. You may summarize the single paper and identify information " +
                        "that cannot be established from its abstract. " +

                        "If multiple papers are supplied, compare their supported objectives, " +
                        "methodologies, findings, and limitations. " +

                        "Distinguish between Source-supported findings, AI interpretations, " +
                        "AI recommendations, and Unverified hypotheses. " +

                        "Do not claim that a research gap is proven unless the supplied sources " +
                        "directly support that conclusion. Distinguish confirmed gaps from possible " +
                        "research opportunities and missing information. " +

                        "Only Source-supported claims may contain evidence. " +
                        "Evidence must use exact IDs from the supplied papers. " +
                        "Do not invent source passages or links. " +

                        "Return ONLY valid JSON with this structure: " +
                        "{\"answer\":\"...\",\"claims\":[{\"text\":\"...\",\"type\":\"Source-supported\"," +
                        "\"evidence\":[{\"paperId\":\"exact paper ID\"}]}]}. " +

                        "Papers: " +
                        JsonSerializer.Serialize(discoveredPapers);

                    string comparisonResult = await _aiService.GetAiResponseAsync(
                        comparisonPrompt,
                        "English",
                        discoveredPapers);

                    var comparison = ParseAiResponse(comparisonResult);

                    if (comparison == null)
                    {
                        return StatusCode(502, new
                        {
                            message = "The AI service returned an invalid comparison response."
                        });
                    }

                    ValidateAndEnrichClaims(comparison, discoveredPapers);

                    return Ok(new WorkflowResponse
                    {
                        Answer = comparison.Answer,
                        CurrentStage = "ComparisonAndGaps",
                        NextStage = "ResearchBrief",
                        RequiresApproval = true,
                        AvailableActions = new List<string>
                {
                    "GenerateBrief",
                    "Back"
                },
                        ResearchQuestion = request.ResearchQuestion,
                        SelectedPaperIds = selectedPaperIds,
                        Papers = discoveredPapers,
                        Analysis = comparison
                    });
                }

                // 6. Generate research brief.
                else if (action.Equals("GenerateBrief", StringComparison.OrdinalIgnoreCase)
                         && currentStage == "ResearchBrief")
                {
                    if (string.IsNullOrWhiteSpace(request.ResearchQuestion))
                    {
                        return BadRequest(new
                        {
                            message = "Research question is required."
                        });
                    }

                    if (selectedPaperIds.Count == 0)
                    {
                        return BadRequest(new
                        {
                            message = "Selected papers are required."
                        });
                    }

                    discoveredPapers =
                        await _openAlexService.GetPapersByIdsAsync(
                            selectedPaperIds);

                    if (discoveredPapers == null || discoveredPapers.Count == 0)
                    {
                        return BadRequest(new
                        {
                            message = "No selected papers could be retrieved from OpenAlex."
                        });
                    }

                    if (discoveredPapers.All(p =>
                        string.IsNullOrWhiteSpace(p.Abstract)))
                    {
                        return Ok(new WorkflowResponse
                        {
                            Answer = "The selected papers do not contain accessible abstracts. A reliable research brief cannot be generated.",
                            CurrentStage = "ResearchBrief",
                            NextStage = "ResearchBrief",
                            RequiresApproval = true,
                            AvailableActions = new List<string>
                    {
                        "GenerateBrief",
                        "Back"
                    },
                            ResearchQuestion = request.ResearchQuestion,
                            SelectedPaperIds = selectedPaperIds,
                            Papers = discoveredPapers,
                            Analysis = analysis
                        });
                    }

                    string briefPrompt =
                        "You are an academic research assistant. Create a structured research brief " +
                        "for this research question: " +
                        request.ResearchQuestion + ". " +

                        "Use the supplied papers only. Include these sections: " +
                        "Research Question, Background, Key Findings, Comparison of Existing Studies, " +
                        "Potential Research Gaps, Limitations, Suggested Future Work, and References. " +

                        "Do not invent findings, references, numerical results, methodologies, " +
                        "or research gaps. If only one paper is supplied, explicitly state that " +
                        "a multi-study comparison cannot be performed. " +

                        "Clearly distinguish source-supported facts from AI interpretations, " +
                        "recommendations, and unverified hypotheses. " +

                        "Do not present recommendations or hypotheses as established findings. " +
                        "Do not claim that a possible research opportunity is a proven research gap. " +

                        "References must use only the supplied paper metadata. " +

                        "Return ONLY valid JSON with this structure: " +
                        "{\"answer\":\"Full research brief text\",\"claims\":[{" +
                        "\"text\":\"...\",\"type\":\"Source-supported\"," +
                        "\"evidence\":[{\"paperId\":\"exact paper ID\"}]}]}. " +

                        "Papers: " +
                        JsonSerializer.Serialize(discoveredPapers);

                    string briefResult = await _aiService.GetAiResponseAsync(
                        briefPrompt,
                        "English",
                        discoveredPapers);

                    var briefResponse = ParseAiResponse(briefResult);

                    if (briefResponse == null)
                    {
                        return StatusCode(502, new
                        {
                            message = "The AI service returned an invalid research brief response."
                        });
                    }

                    ValidateAndEnrichClaims(briefResponse, discoveredPapers);

                    researchBrief = briefResponse.Answer;

                    // Keep the previous comparison/analysis sent by the client.
                    analysis = request.PreviousAnalysis;

                    return Ok(new WorkflowResponse
                    {
                        Answer = "Research brief generated. Please review it before final approval.",
                        CurrentStage = "ResearchBrief",
                        NextStage = "Completed",
                        RequiresApproval = true,
                        AvailableActions = new List<string>
                {
                    "Approve",
                    "Back"
                },
                        ResearchQuestion = request.ResearchQuestion,
                        SelectedPaperIds = selectedPaperIds,
                        Papers = discoveredPapers,
                        Analysis = analysis,
                        ResearchBrief = researchBrief
                    });
                }

                // 7. Approve current stage.
                else if (action.Equals("Approve", StringComparison.OrdinalIgnoreCase))
                {
                    if (request.StudentApproval != true)
                    {
                        return BadRequest(new
                        {
                            message = "Student approval is required."
                        });
                    }

                    if (currentStage == "Completed")
                    {
                        return BadRequest(new
                        {
                            message = "Workflow is already completed."
                        });
                    }

                    if (currentStage == "ResearchQuestion" &&
                        string.IsNullOrWhiteSpace(request.ResearchQuestion))
                    {
                        return BadRequest(new
                        {
                            message = "Research question is required."
                        });
                    }

                    if (currentStage == "PaperDiscovery" &&
                        selectedPaperIds.Count == 0)
                    {
                        return BadRequest(new
                        {
                            message = "Select at least one paper."
                        });
                    }

                    if (currentStage == "PaperAnalysis" ||
                        currentStage == "ComparisonAndGaps")
                    {
                        return BadRequest(new
                        {
                            message = "Complete the current stage before approving it."
                        });
                    }

                    nextStage = stages[index + 1];

                    if (currentStage == "ResearchBrief")
                    {
                        if (selectedPaperIds.Count == 0)
                        {
                            return BadRequest(new
                            {
                                message = "Selected papers are required."
                            });
                        }

                        discoveredPapers =
                            await _openAlexService.GetPapersByIdsAsync(
                                selectedPaperIds);

                        if (discoveredPapers == null || discoveredPapers.Count == 0)
                        {
                            return BadRequest(new
                            {
                                message = "Could not retrieve the selected papers."
                            });
                        }

                        analysis = request.PreviousAnalysis;

                        researchBrief = request.PreviousResearchBrief ?? string.Empty;

                        if (string.IsNullOrWhiteSpace(researchBrief))
                        {
                            return BadRequest(new
                            {
                                message = "Research brief is missing. Generate the brief again before approval."
                            });
                        }

                        if (analysis != null)
                        {
                            ValidateAndEnrichClaims(analysis, discoveredPapers);
                        }
                    }

                    answer = nextStage == "Completed"
                        ? "Your research workflow is complete."
                        : $"You have moved to {nextStage}.";
                }

                // 8. Invalid action.
                else
                {
                    return BadRequest(new
                    {
                        message = "Invalid action for the current workflow stage."
                    });
                }

                int nextIndex = Array.IndexOf(stages, nextStage);

                return Ok(new WorkflowResponse
                {
                    Answer = answer,

                    CurrentStage = nextStage,

                    NextStage = nextIndex >= stages.Length - 1
                        ? string.Empty
                        : stages[nextIndex + 1],

                    RequiresApproval = nextStage != "Completed",

                    AvailableActions = nextStage == "Completed"
                        ? new List<string> { "Back" }
                        : nextStage == "PaperDiscovery"
                            ? new List<string> { "Discover", "Approve", "Back" }
                            : nextStage == "PaperAnalysis"
                                ? new List<string> { "Analyze", "Back" }
                                : nextStage == "ComparisonAndGaps"
                                    ? new List<string> { "Compare", "Back" }
                                    : nextStage == "ResearchBrief"
                                        ? new List<string> { "GenerateBrief", "Approve", "Back" }
                                        : new List<string> { "Approve", "Back" },

                    ResearchQuestion = request.ResearchQuestion,

                    SelectedPaperIds = selectedPaperIds,

                    Papers = discoveredPapers,

                    Analysis = analysis,

                    ResearchBrief = researchBrief
                });
            }
            catch (HttpRequestException ex)
            {
                _logger.LogError(ex, "External API request failed in Workflow.");

                return StatusCode(502, new
                {
                    message = "An external research or AI service is currently unavailable. Please try again later."
                });
            }
            catch (TaskCanceledException ex)
            {
                _logger.LogError(ex, "Workflow request timed out.");

                return StatusCode(504, new
                {
                    message = "The workflow request took too long. Please try again."
                });
            }
            catch (JsonException ex)
            {
                _logger.LogError(ex, "Invalid JSON response in Workflow.");

                return StatusCode(502, new
                {
                    message = "The AI service returned an invalid response. Please try again."
                });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Unexpected Workflow error.");

                return StatusCode(500, new
                {
                    message = "An unexpected server error occurred."
                });
            }
        }





        private static bool ContainsArabic(string text)
        {
            return text.Any(c =>
                (c >= '\u0600' && c <= '\u06FF') ||
                (c >= '\u0750' && c <= '\u077F') ||
                (c >= '\u08A0' && c <= '\u08FF'));
        }



        private static string NormalizeClaimType(string? type)
        {
            if (string.IsNullOrWhiteSpace(type))
                return "Unverified hypothesis";

            return AllowedClaimTypes.FirstOrDefault(
                allowed => string.Equals(
                    allowed,
                    type.Trim(),
                    StringComparison.OrdinalIgnoreCase))
                ?? "Unverified hypothesis";
        }

        private static void ValidateAndEnrichClaims(
            ChatResponse response,
            List<ResearchPaper> papers)
        {
            response.Claims ??= new List<ClaimResponse>();

            foreach (var claim in response.Claims)
            {
                claim.Text ??= string.Empty;
                claim.Type = NormalizeClaimType(claim.Type);
                claim.Evidence ??= new List<EvidenceResponse>();

                // Only Source-supported claims can contain evidence.
                if (claim.Type != "Source-supported")
                {
                    claim.Evidence.Clear();
                    claim.CitationCheckStatus = "Not applicable";
                    continue;
                }

                var validEvidence = new List<EvidenceResponse>();

                foreach (var item in claim.Evidence)
                {
                    if (string.IsNullOrWhiteSpace(item.PaperId))
                        continue;

                    var paper = papers.FirstOrDefault(p =>
                        string.Equals(
                            p.Id?.Trim().TrimEnd('/'),
                            item.PaperId.Trim().TrimEnd('/'),
                            StringComparison.OrdinalIgnoreCase));

                    // Ignore references that were not returned by OpenAlex.
                    if (paper == null)
                        continue;

                    string paperLink = paper.PaperLink;

                    if (string.IsNullOrWhiteSpace(paperLink))
                        paperLink = !string.IsNullOrWhiteSpace(paper.Doi)
                            ? paper.Doi
                            : paper.Id;

                    if (!string.IsNullOrWhiteSpace(paperLink) &&
                        paperLink.StartsWith("10.", StringComparison.OrdinalIgnoreCase))
                    {
                        paperLink = "https://doi.org/" + paperLink;
                    }

                    validEvidence.Add(new EvidenceResponse
                    {
                        PaperId = paper.Id,
                        PaperTitle = paper.Title,
                        Authors = paper.Authors,
                        PublicationYear = paper.PublicationYear,
                        SourcePassage = paper.Abstract ?? string.Empty,
                        PaperLink = paperLink,
                        EvidenceStatus = string.IsNullOrWhiteSpace(paper.Abstract)
                            ? "Incomplete"
                            : "Available",
                        SearchRank = papers.IndexOf(paper) + 1
                    });
                }

                claim.Evidence = validEvidence;

                if (validEvidence.Count == 0)
                {
                    // A source-supported claim without a valid source
                    // must not remain source-supported.
                    claim.Type = "Unverified hypothesis";
                    claim.CitationCheckStatus = "No valid reference found";
                }
                else if (validEvidence.Any(e => e.EvidenceStatus == "Available"))
                {
                    claim.CitationCheckStatus =
                        "Reference found; abstract available; claim not independently verified against full text";
                }
                else
                {
                    claim.CitationCheckStatus =
                        "Reference found; abstract unavailable";
                }
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
                    message = "Could not retrieve research papers."
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

                return StatusCode(502, new
                {
                    message = "Could not connect to Gemini."
                });
            }
        }
    }
}
