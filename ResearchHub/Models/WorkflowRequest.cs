
namespace ResearchHub.Models
{
    public class WorkflowRequest
    {
        public string CurrentStage { get; set; } = "Onboarding";

        public string Action { get; set; } = "Start";

        public string ResearchQuestion { get; set; } = string.Empty;

        public List<string> SelectedPaperIds { get; set; } = new();

        public bool? StudentApproval { get; set; }

        public string ResearchBrief { get; set; } = string.Empty;
        public ChatResponse? PreviousAnalysis { get; set; }

        public string PreviousResearchBrief { get; set; } = string.Empty;

    }
}
