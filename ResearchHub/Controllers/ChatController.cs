using Microsoft.AspNetCore.Mvc;
using ResearchHub.Models;
using ResearchHub.Services;
using System.Threading.Tasks;

namespace ResearchHub.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    public class ChatController : ControllerBase
    {
        private readonly IAiService _aiService;

        public ChatController(IAiService aiService)
        {
            _aiService = aiService;
        }

        [HttpPost("ask")]
        public async Task<IActionResult> AskModel([FromBody] ChatRequest request)
        {
            string aiGeneratedAnswer = await _aiService.GetAiResponseAsync(request.UserMessage);

            var response = new ChatResponse
            {
                Answer = aiGeneratedAnswer,
                Evidence = new EvidenceModel
                {
                    SourcePassage = "This is a simulated retrieved passage for transparency.",
                    PaperLink = "https://openalex.org/W123456",
                    RetrievalScore = 0.88
                }
            };

            return Ok(response);
        }
    }
}