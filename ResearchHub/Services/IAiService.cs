using ResearchHub.Models;

namespace ResearchHub.Services
{
    public interface IAiService
    {
        Task<string> GetAiResponseAsync(
            string userMessage,
            string language,
            List<ResearchPaper> papers);

        Task<string> GetAvailableModelsAsync();
    }
}