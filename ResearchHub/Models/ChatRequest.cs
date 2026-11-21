
using System.ComponentModel.DataAnnotations;

namespace ResearchHub.Models
{
    public class ChatRequest
    {
        [Required]
        [StringLength(2000, MinimumLength = 1)]
        public string UserMessage { get; set; } = string.Empty;

        [Required]
        public string Language { get; set; } = "English";

        // HAI workflow information
        public string CurrentStage { get; set; } = "ResearchQuestion";

        public string Action { get; set; } = "Ask";

        public string ResearchQuestion { get; set; } = string.Empty;

        public List<string> SelectedPaperIds { get; set; } = new();

        public bool? StudentApproval { get; set; }
    }
}
