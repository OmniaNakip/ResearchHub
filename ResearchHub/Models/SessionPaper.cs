
namespace ResearchHub.Models
{
    public class SessionPaper
    {
        public Guid Id { get; set; } = Guid.NewGuid();

        public Guid ResearchSessionId { get; set; }

        public string OpenAlexPaperId { get; set; } = string.Empty;

        public bool IsSelected { get; set; } = false;

        public bool IsRecommended { get; set; } = false;

        public ResearchSession? ResearchSession { get; set; }
    }
}
