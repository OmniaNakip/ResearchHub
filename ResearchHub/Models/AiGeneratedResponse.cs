
namespace ResearchHub.Models
{
    public class AiGeneratedResponse
    {
        public string Answer { get; set; } = string.Empty;
        public List<AiGeneratedClaim> Claims { get; set; } = new();
    }

    public class AiGeneratedClaim
    {
        public string Text { get; set; } = string.Empty;
        public string Type { get; set; } = string.Empty;
        public List<AiGeneratedEvidence> Evidence { get; set; } = new();
    }

    public class AiGeneratedEvidence
    {
        public string PaperId { get; set; } = string.Empty;
    }
}
