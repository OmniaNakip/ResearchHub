namespace ResearchHub.Models
{
    public class ChatResponse
    {
        public string Answer { get; set; }
        public EvidenceModel Evidence { get; set; }
    }

    public class EvidenceModel
    {
        public string SourcePassage { get; set; }
        public string PaperLink { get; set; }
        public double RetrievalScore { get; set; }
    }
}

