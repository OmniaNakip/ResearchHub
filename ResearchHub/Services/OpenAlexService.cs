using System.Text.Json;
using ResearchHub.Models;

namespace ResearchHub.Services
{
    public class OpenAlexService
    {
        private readonly HttpClient _httpClient;

        public OpenAlexService(HttpClient httpClient)
        {
            _httpClient = httpClient;
        }

        public async Task<List<ResearchPaper>> SearchPapersAsync(
            string searchQuery)
        {
            string url =
                "https://api.openalex.org/works" +
                $"?search={Uri.EscapeDataString(searchQuery)}" +
                "&per-page=5" +
                "&select=id,doi,title,publication_year,authorships,abstract_inverted_index";

            using var response = await _httpClient.GetAsync(url);

            response.EnsureSuccessStatusCode();

            string json = await response.Content.ReadAsStringAsync();

            using var document = JsonDocument.Parse(json);

            var papers = new List<ResearchPaper>();

            var results = document.RootElement.GetProperty("results");

            foreach (var item in results.EnumerateArray())
            {
                string id = GetString(item, "id");
                string doi = GetString(item, "doi");

                string title = GetString(item, "title");

                int? year = null;

                if (item.TryGetProperty(
                    "publication_year", out var yearElement) &&
                    yearElement.ValueKind == JsonValueKind.Number)
                {
                    year = yearElement.GetInt32();
                }

                var authors = new List<string>();

                if (item.TryGetProperty(
                    "authorships", out var authorships))
                {
                    foreach (var authorship in authorships.EnumerateArray())
                    {
                        if (authorship.TryGetProperty(
                            "author", out var author) &&
                            author.TryGetProperty(
                                "display_name", out var name))
                        {
                            authors.Add(name.GetString() ?? "");
                        }
                    }
                }

                string abstractText = "";

                if (item.TryGetProperty(
                    "abstract_inverted_index", out var abstractIndex) &&
                    abstractIndex.ValueKind == JsonValueKind.Object)
                {
                    abstractText = ReconstructAbstract(abstractIndex);
                }

                papers.Add(new ResearchPaper
                {
                    Id = id,
                    Title = title,
                    Doi = doi,
                    PaperLink = doi,
                    PublicationYear = year,
                    Authors = string.Join(", ", authors),
                    Abstract = abstractText
                });
            }

            return papers;
        }

        private static string GetString(
            JsonElement element,
            string propertyName)
        {
            if (element.TryGetProperty(
                propertyName, out var property) &&
                property.ValueKind == JsonValueKind.String)
            {
                return property.GetString() ?? "";
            }

            return "";
        }

        private static string ReconstructAbstract(
            JsonElement invertedIndex)
        {
            var words = new SortedDictionary<int, string>();

            foreach (var word in invertedIndex.EnumerateObject())
            {
                foreach (var position in word.Value.EnumerateArray())
                {
                    words[position.GetInt32()] = word.Name;
                }
            }

            return string.Join(" ", words.Values);
        }
    }
}