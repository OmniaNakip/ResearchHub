
namespace ResearchHub.Models
{
    public class WorkflowResponse
    {
        public string Answer { get; set; } = string.Empty;

        public string CurrentStage { get; set; } = string.Empty;

        public string NextStage { get; set; } = string.Empty;

        public bool RequiresApproval { get; set; }

        public List<string> AvailableActions { get; set; } = new();

        public string ResearchQuestion { get; set; } = string.Empty;

        public List<string> SelectedPaperIds { get; set; } = new();
        public List<ResearchPaper> Papers { get; set; } = new();
        public ChatResponse? Analysis { get; set; }
        public string ResearchBrief { get; set; } = string.Empty;
    }
}
