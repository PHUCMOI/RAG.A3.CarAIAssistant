using System.Net.Http.Json;
using System.Text.Json;
namespace AutoWise.OwnerFeatures.Infrastructure;

// All presentation goes through the shared Bedrock stage after authenticated tools.
// It receives their result only; it cannot select orders or execute actions.
public sealed class NaturalAnswers(HttpClient http)
{
    public async Task<string> Compose(string question, object verifiedData, CancellationToken ct)
    {
        using var response = await http.PostAsJsonAsync("api/chat/compose", new { question, verifiedData }, ct);
        response.EnsureSuccessStatusCode();
        using var json = JsonDocument.Parse(await response.Content.ReadAsStringAsync(ct));
        var answer = json.RootElement.GetProperty("answer").GetString();
        if (string.IsNullOrWhiteSpace(answer)) throw new HttpRequestException("Bedrock chưa tạo được câu trả lời.");
        return answer;
    }
}
