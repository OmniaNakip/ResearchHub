
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
    }
}
