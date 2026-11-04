using System.Threading.Tasks;

namespace ResearchHub.Services
{
    public interface IAiService
    {
        Task<string> GetAiResponseAsync(string userMessage);
    }
}