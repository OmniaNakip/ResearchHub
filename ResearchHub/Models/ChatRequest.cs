namespace ResearchHub.Models
{
    public class ChatRequest
    {
        public string UserMessage { get; set; }
        public string Language { get; set; } = "English";
    }
}