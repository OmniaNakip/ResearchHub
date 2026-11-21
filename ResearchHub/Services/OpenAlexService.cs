
using System.Text.Json;
using ResearchHub.Models;

namespace ResearchHub.Services
{
    public class OpenAlexService
    {
        private readonly HttpClient _httpClient;
        private readonly IConfiguration _configuration;

        public OpenAlexService(
            HttpClient httpClient,
            IConfiguration configuration)
        {
            _httpClient = httpClient;
            _configuration = configuration;
        }

        public async Task<List<ResearchPaper>> SearchPapersAsync(
            string searchQuery)
        {
            string apiKey = _configuration["OpenAlex:ApiKey"]
                ?? throw new InvalidOperationException(
                    "OpenAlex API Key is missing.");

            string url =
                "https://api.openalex.org/works" +
                $"?search={Uri.EscapeDataString(searchQuery)}" +
                "&per-page=5" +
                "&select=id,doi,title,publication_year,authorships,abstract_inverted_index" +
                $"&api_key={Uri.EscapeDataString(apiKey)}";

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




        public async Task<List<ResearchPaper>> GetPapersByIdsAsync(
            List<string> paperIds)
        {
            var result = new List<ResearchPaper>();

            if (paperIds == null || paperIds.Count == 0)
                return result;

            string apiKey = _configuration["OpenAlex:ApiKey"]
                ?? throw new InvalidOperationException(
                    "OpenAlex API Key is missing.");

            foreach (var paperId in paperIds)
            {
                if (string.IsNullOrWhiteSpace(paperId))
                    continue;

                string id = paperId.Trim();

                // Extract OpenAlex ID from URL
                if (id.Contains("/works/", StringComparison.OrdinalIgnoreCase))
                {
                    id = id.Split(
                        "/works/",
                        StringSplitOptions.RemoveEmptyEntries).Last();
                }
                else if (id.Contains(
                    "openalex.org/",
                    StringComparison.OrdinalIgnoreCase))
                {
                    id = id.Split(
                        "openalex.org/",
                        StringSplitOptions.RemoveEmptyEntries).Last();
                }

                id = id.Trim().Trim('/');

                if (!id.StartsWith("W", StringComparison.OrdinalIgnoreCase))
                    continue;

                id = id.ToUpperInvariant();

                string url =
                    $"https://api.openalex.org/works/{id}" +
                    "?select=id,doi,title,publication_year,authorships,abstract_inverted_index" +
                    $"&api_key={Uri.EscapeDataString(apiKey)}";

                using var response = await _httpClient.GetAsync(url);

                response.EnsureSuccessStatusCode();

                string json = await response.Content.ReadAsStringAsync();

                using var document = JsonDocument.Parse(json);

                var root = document.RootElement;

                // Get basic information
                string paperIdFromApi = GetString(root, "id");
                string title = GetString(root, "title");
                string doi = GetString(root, "doi");

                // Get publication year
                int? year = null;

                if (root.TryGetProperty(
                    "publication_year", out var yearElement) &&
                    yearElement.ValueKind == JsonValueKind.Number)
                {
                    year = yearElement.GetInt32();
                }

                // Get authors
                var authors = new List<string>();

                if (root.TryGetProperty(
                    "authorships", out var authorships) &&
                    authorships.ValueKind == JsonValueKind.Array)
                {
                    foreach (var authorship in authorships.EnumerateArray())
                    {
                        if (authorship.TryGetProperty(
                            "author", out var author) &&
                            author.TryGetProperty(
                                "display_name", out var name))
                        {
                            string authorName = name.GetString() ?? "";

                            if (!string.IsNullOrWhiteSpace(authorName))
                                authors.Add(authorName);
                        }
                    }
                }

                // Get abstract
                string abstractText = "";

                if (root.TryGetProperty(
                    "abstract_inverted_index", out var abstractIndex) &&
                    abstractIndex.ValueKind == JsonValueKind.Object)
                {
                    abstractText = ReconstructAbstract(abstractIndex);
                }

                // Create ResearchPaper object
                var paper = new ResearchPaper
                {
                    Id = paperIdFromApi,
                    Title = title,
                    Doi = doi,
                    PaperLink = !string.IsNullOrWhiteSpace(doi)
                        ? doi
                        : paperIdFromApi,
                    PublicationYear = year,
                    Authors = string.Join(", ", authors),
                    Abstract = abstractText
                };

                result.Add(paper);
            }

            return result;
        }



    }
}
