using System.Net.Http.Json;
using System.Text.Json;
using AutoWise.OwnerFeatures.Application;
namespace AutoWise.OwnerFeatures.Infrastructure;

// All presentation goes through the shared Bedrock stage after authenticated tools.
// It receives their result only; it cannot select orders or execute actions.
public sealed class NaturalAnswers(HttpClient http)
{
    public record Result(string Answer, bool Grounded, string Status, List<JsonElement> Evidence, List<JsonElement> Citations);
    public async Task<Result> ComposeGrounded(string question, object verifiedData, CancellationToken ct)
    {
        using var response = await http.PostAsJsonAsync("api/chat/compose", new { question, verifiedData }, ct);
        response.EnsureSuccessStatusCode();
        using var json = JsonDocument.Parse(await response.Content.ReadAsStringAsync(ct));
        var answer = json.RootElement.GetProperty("answer").GetString();
        if (string.IsNullOrWhiteSpace(answer)) throw new HttpRequestException("Bedrock chưa tạo được câu trả lời.");
        return new(answer, json.RootElement.GetProperty("grounded").GetBoolean(),
            json.RootElement.GetProperty("status").GetString()!,
            json.RootElement.GetProperty("evidence").EnumerateArray().Select(e => e.Clone()).ToList(),
            json.RootElement.GetProperty("citations").EnumerateArray().Select(e => e.Clone()).ToList());
    }
    public async Task<string> Compose(string question, object verifiedData, CancellationToken ct) =>
        (await ComposeGrounded(question, verifiedData, ct)).Answer;
}
