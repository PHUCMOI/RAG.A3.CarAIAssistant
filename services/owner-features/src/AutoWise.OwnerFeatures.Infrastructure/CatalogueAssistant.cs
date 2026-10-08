using System.Net.Http.Json;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;
using AutoWise.OwnerFeatures.Application;
using AutoWise.OwnerFeatures.Domain;
using Microsoft.EntityFrameworkCore;
namespace AutoWise.OwnerFeatures.Infrastructure;

public record CatalogueChatOptions(string ImageApiUrl);
public sealed class CatalogueAssistant(OrdersDb db, HttpClient http, CatalogueChatOptions options)
{
    static List<ChatTurn> Turns(ChatSessionRecord row) => JsonSerializer.Deserialize<List<ChatTurn>>(row.Payload, OrderStore.Json)!;
    static void Validate(ChatSessionRecord row, List<ChatTurn> turns, CatalogueChatInput input, string hash)
    {
        if (turns.FirstOrDefault(t => t.RequestId == input.RequestId) is {} replay) {
            if (replay.Hash != hash) throw new VersionConflictException();
            return;
        }
        if (row.Version != input.Version) throw new VersionConflictException();
        if (turns.Count >= 100) throw new BusinessRuleException("Hội thoại đạt 100 lượt; hãy tạo hội thoại mới.");
    }
    public async Task<ChatSession> Send(Guid sessionId, Guid userId, CatalogueChatInput input, CancellationToken ct)
    {
        if (input.RequestId == Guid.Empty || input.Content == null || input.Content.Length > 1000 || string.IsNullOrWhiteSpace(input.Content) && input.ImageBase64 == null)
            throw new BusinessRuleException("Cần câu hỏi hoặc ảnh xe và requestId hợp lệ.");
        var row = await db.ChatSessions.AsNoTracking().SingleOrDefaultAsync(s => s.Id == sessionId && s.UserId == userId, ct) ?? throw new KeyNotFoundException();
        var hash = Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(JsonSerializer.Serialize(input, OrderStore.Json))));
        var turns = Turns(row); Validate(row, turns, input, hash);
        if (turns.Any(t => t.RequestId == input.RequestId)) return OrderAssistant.View(row);
        HttpResponseMessage response;
        string? imageUrl = null;
        if (input.ImageBase64 != null)
        {
            if (input.MimeType is not ("image/jpeg" or "image/png" or "image/webp") || input.ImageBase64.Length > 14_000_000)
                throw new BusinessRuleException("Chọn ảnh JPEG, PNG hoặc WebP tối đa 10 MB.");
            byte[] bytes;
            try { bytes = Convert.FromBase64String(input.ImageBase64); }
            catch (FormatException) { throw new BusinessRuleException("Ảnh không hợp lệ."); }
            if (bytes.Length == 0 || bytes.Length > 10_000_000) throw new BusinessRuleException("Ảnh phải nhỏ hơn 10 MB.");
            using var form = new MultipartFormDataContent();
            var file = new ByteArrayContent(bytes); file.Headers.ContentType = new(input.MimeType);
            form.Add(file, "file", "car-image");
            if (!string.IsNullOrWhiteSpace(input.Content)) form.Add(new StringContent(input.Content), "message");
            response = await http.PostAsync(new Uri(new Uri(options.ImageApiUrl), "chat"), form, ct);
            imageUrl = $"data:{input.MimeType};base64,{input.ImageBase64}";
        }
        else
        {
            var context = turns.SelectMany(t => t.Messages).LastOrDefault(m => m.Catalog && m.Role == "assistant" && m.Contexts?.Count > 0)?.Contexts;
            var normalized = AssistantIntent.Normalize(input.Content);
            var confirmed = Regex.IsMatch(normalized.Trim(), @"^(dung|dung roi|vang|ok|chinh xac|yes)[.! ]*$");
            var previousQuestion = turns.SelectMany(t => t.Messages).LastOrDefault(m => m.Role == "user" && m.Catalog)?.Content;
            var effectiveQuestion = confirmed && previousQuestion != null ? previousQuestion : input.Content;
            var refers = Regex.IsMatch(normalized, @"xe (do|nay)|mau (do|nay)|trong anh|trong hinh");
            var question = refers && context?.Count > 0 ? $"{input.Content} (Xe đang trao đổi: {context[0].DisplayName})" : effectiveQuestion;
            var carIds = confirmed && context?.Count > 0 ? context.Select(c => c.CarId).ToArray() : refers && context?.Count > 0 && !Regex.IsMatch(normalized, "so sanh|compare") ? new[] { context[0].CarId } : null;
            response = await http.PostAsJsonAsync("api/chat", new { question, carIds, clarification=input.Clarification }, ct);
        }
        using (response)
        {
            response.EnsureSuccessStatusCode();
            using var document = JsonDocument.Parse(await response.Content.ReadAsStringAsync(ct));
            var root = document.RootElement;
            var answer = root.GetProperty("answer").GetString();
            if (string.IsNullOrWhiteSpace(answer)) throw new HttpRequestException("Dịch vụ tư vấn chưa trả lời được.");
            var contexts = new List<CatalogContext>();
            if (input.ImageBase64 == null && root.TryGetProperty("contexts", out var catalog) && catalog.ValueKind == JsonValueKind.Array)
                contexts = JsonSerializer.Deserialize<List<CatalogContext>>(catalog.GetRawText(), OrderStore.Json) ?? [];
            if (input.ImageBase64 != null && root.TryGetProperty("catalog_contexts", out var imageCatalog) && imageCatalog.ValueKind == JsonValueKind.Array)
                contexts = JsonSerializer.Deserialize<List<CatalogContext>>(imageCatalog.GetRawText(), OrderStore.Json) ?? [];
            if (root.TryGetProperty("identified_cars", out var cars) && cars.ValueKind == JsonValueKind.Array)
                foreach (var car in cars.EnumerateArray()) {
                    var id = car.GetProperty("car_id").GetString()!;
                    if (contexts.Any(c => c.CarId == id)) continue;
                    var name = string.Join(" ", new[] { car.TryGetProperty("brand", out var brand) ? brand.GetString() : null, car.TryGetProperty("model", out var model) ? model.GetString() : null }.Where(s => !string.IsNullOrWhiteSpace(s)));
                    contexts.Add(new(id, name.Length > 0 ? name : id));
                }
            bool? uncertain = root.TryGetProperty("uncertain", out var uncertainty) && uncertainty.ValueKind is JsonValueKind.True or JsonValueKind.False ? uncertainty.GetBoolean() : null;
            await using var tx = await db.Database.BeginTransactionAsync(ct);
            await db.Database.ExecuteSqlInterpolatedAsync($"SELECT pg_advisory_xact_lock(hashtextextended({sessionId.ToString()},0))", ct);
            var current = await db.ChatSessions.SingleAsync(s => s.Id == sessionId && s.UserId == userId, ct);
            var currentTurns = Turns(current); Validate(current, currentTurns, input, hash);
            if (currentTurns.Any(t => t.RequestId == input.RequestId)) return OrderAssistant.View(current);
            var at = DateTimeOffset.UtcNow;
            var mode = root.TryGetProperty("generationMode", out var generation) ? generation.GetString() : root.TryGetProperty("generation_mode", out generation) ? generation.GetString() : null;
            currentTurns.Add(new(input.RequestId, hash, [new("user", input.OriginalContent ?? (string.IsNullOrWhiteSpace(input.Content) ? "Nhận diện xe trong ảnh" : input.Content), at, Catalog: true, ImageUrl: imageUrl), new("assistant", answer, at, Catalog: true, Contexts: contexts, Uncertain: uncertain, GenerationMode: mode)]));
            current.Payload = JsonSerializer.Serialize(currentTurns, OrderStore.Json);
            current.Version++; current.UpdatedAt = at;
            await db.SaveChangesAsync(ct); await tx.CommitAsync(ct);
            return OrderAssistant.View(current);
        }
    }
}
