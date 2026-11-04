
namespace ResearchHub.Models
{
    public class ChatResponse
    {
        public string Answer { get; set; } = string.Empty;

        public List<ClaimResponse> Claims { get; set; } = new();
    }

    public class ClaimResponse
    {
        public string Text { get; set; } = string.Empty;

        public string Type { get; set; } = string.Empty;

        public List<EvidenceResponse> Evidence { get; set; } = new();
    }

    public class EvidenceResponse
    {
        public string SourcePassage { get; set; } = string.Empty;

        public string PaperLink { get; set; } = string.Empty;

        public double RetrievalScore { get; set; }
    }
}
