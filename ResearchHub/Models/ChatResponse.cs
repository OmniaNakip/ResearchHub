
namespace ResearchHub.Models
{
    public class ChatResponse
    {
        public string Answer { get; set; } = string.Empty;

        public List<ClaimResponse> Claims { get; set; } = new();

        // HAI workflow information
        public string CurrentStage { get; set; } = string.Empty;

        public string NextStage { get; set; } = string.Empty;

        public bool RequiresApproval { get; set; }

        public List<string> AvailableActions { get; set; } = new();

        public string ResearchQuestion { get; set; } = string.Empty;

        public List<string> SelectedPaperIds { get; set; } = new();
    }

    public class ClaimResponse
    {
        public string Text { get; set; } = string.Empty;

        // Source-supported, AI interpretation,
        // AI recommendation, Unverified hypothesis
        public string Type { get; set; } = "Unverified hypothesis";

        public List<EvidenceResponse> Evidence { get; set; } = new();

        public string CitationCheckStatus { get; set; } = "Not checked";
    }

    public class EvidenceResponse
    {
        public string PaperId { get; set; } = string.Empty;

        public string PaperTitle { get; set; } = string.Empty;

        public string Authors { get; set; } = string.Empty;

        public int? PublicationYear { get; set; }

        public string SourcePassage { get; set; } = string.Empty;

        public string PaperLink { get; set; } = string.Empty;

        // Available, Incomplete, Conflicting, Unavailable
        public string EvidenceStatus { get; set; } = "Unavailable";

        // Position in OpenAlex search results, not confidence.
        public int SearchRank { get; set; }
    }
}
