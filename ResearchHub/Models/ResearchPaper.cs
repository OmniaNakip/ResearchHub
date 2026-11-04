namespace ResearchHub.Models
{
    public class ResearchPaper
    {
        public string Id { get; set; } = string.Empty;

        public string Title { get; set; } = string.Empty;

        public string Doi { get; set; } = string.Empty;

        public string PaperLink { get; set; } = string.Empty;

        public int? PublicationYear { get; set; }

        public string Authors { get; set; } = string.Empty;

        public string Abstract { get; set; } = string.Empty;

        public double RetrievalScore { get; set; }
    }
}