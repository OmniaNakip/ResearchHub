
namespace ResearchHub.Models
{
    public class ResearchSession
    {
        public Guid Id { get; set; } = Guid.NewGuid();

        public string Topic { get; set; } = string.Empty;

        public string ResearchQuestion { get; set; } = string.Empty;

        public string CurrentStage { get; set; } = "Onboarding";

        public bool IsCompleted { get; set; } = false;

        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

        public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;

        public List<SessionPaper> Papers { get; set; } = new();
    }
}
