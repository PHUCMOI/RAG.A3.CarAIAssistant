using System.Net.Http.Json;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using AutoWise.OwnerFeatures.Application;
using AutoWise.OwnerFeatures.Domain;
using Microsoft.EntityFrameworkCore;

namespace AutoWise.OwnerFeatures.Infrastructure;

// The browser supplies raw input only. Routing, history and image/order evidence are server-owned.
public sealed class UnifiedAssistant(OrdersDb db, HttpClient http, CatalogueChatOptions options,
    IOrderAssistant orders, CatalogueAssistant catalogue)
{
    public async Task<ChatSession> Send(Guid sessionId, Guid userId, UnifiedChatInput input, CancellationToken ct)
    {
        if (input.RequestId == Guid.Empty || input.Content == null || input.Content.Length > 1000 ||
            string.IsNullOrWhiteSpace(input.Content) && input.ImageBase64 == null)
            throw new BusinessRuleException("Cần câu hỏi hoặc ảnh và requestId hợp lệ.");
        var row = await db.ChatSessions.AsNoTracking().SingleOrDefaultAsync(s => s.Id == sessionId && s.UserId == userId, ct)
            ?? throw new KeyNotFoundException();
        var hash = Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(JsonSerializer.Serialize(input, OrderStore.Json))));
        var turns = JsonSerializer.Deserialize<List<ChatTurn>>(row.Payload, OrderStore.Json)!;
        if (turns.FirstOrDefault(t => t.RequestId == input.RequestId) is {} replay) {
            if (replay.Hash != hash) throw new VersionConflictException();
            return OrderAssistant.View(row);
        }
        if (row.Version != input.Version) throw new VersionConflictException();
        if (RestrictedAdminQuestions.Matches(input.Content))
            return await RestrictedAdminQuestions.Reject(db, sessionId, userId, input.RequestId, input.Version, input.Content, hash, ct);
        byte[]? imageBytes = null;
        if (input.ImageBase64 != null) {
            if (input.MimeType is not ("image/jpeg" or "image/png" or "image/webp") || input.ImageBase64.Length > 14_000_000)
                throw new BusinessRuleException("Chọn ảnh JPEG, PNG hoặc WebP tối đa 10 MB.");
            try { imageBytes = Convert.FromBase64String(input.ImageBase64); }
            catch (FormatException) { throw new BusinessRuleException("Ảnh không hợp lệ."); }
            if (imageBytes.Length == 0 || imageBytes.Length > 10_000_000) throw new BusinessRuleException("Ảnh phải nhỏ hơn 10 MB.");
        }
        if (imageBytes != null) await ChatAttachments.CheckBudget(db, sessionId, imageBytes.Length, ct);
        var messages = turns.SelectMany(t => t.Messages).ToList();
        var original = string.IsNullOrWhiteSpace(input.Content) ? "Nhận diện xe trong ảnh" : input.Content;
        var reference = imageBytes == null ? CatalogueReferences.Resolve(original, messages) : new CatalogueReference(original);
        if (reference.Clarification != null)
            return await catalogue.Send(sessionId,userId,new(input.RequestId,input.Version,original,
                OriginalContent:original,Clarification:reference.Clarification),ct,hash);
        using var response = await http.PostAsJsonAsync("api/chat/understand", new { question=reference.Question,
            context=new { hasImage=imageBytes != null, lastRoute=messages.LastOrDefault()?.Catalog == false ? "orders" : "catalogue",
                lastContexts=messages.LastOrDefault(m => m.Catalog && m.Role == "assistant" && m.Contexts?.Count > 0)
                    ?.Contexts!.Select(c => new { c.CarId, c.DisplayName }),
                recentQuestions=messages.Where(m => m.Role == "user").TakeLast(3).Select(m => m.Content),
                lastAnswer=messages.LastOrDefault()?.Content is {} last ? last[..Math.Min(last.Length,1800)] : null } }, ct);
        response.EnsureSuccessStatusCode();
        using var json = JsonDocument.Parse(await response.Content.ReadAsStringAsync(ct));
        var question = json.RootElement.GetProperty("question").GetString()!;
        var route = json.RootElement.GetProperty("route").GetString();
        var clarification = json.RootElement.GetProperty("needsClarification").GetBoolean()
            ? json.RootElement.GetProperty("clarification").GetString() : null;
        if (route != "orders")
            return await catalogue.Send(sessionId,userId,new(input.RequestId,input.Version,question,
                input.ImageBase64,input.MimeType,original,clarification),ct,hash);
        ImageOrderEvidence? match = null;
        if (imageBytes != null) {
            using var form = new MultipartFormDataContent();
            var file = new ByteArrayContent(imageBytes); file.Headers.ContentType = new(input.MimeType!);
            // Confidence uses the top-two margin; consume only the first match after scoring candidates.
            form.Add(file,"file","car-image"); form.Add(new StringContent("5"),"top_k");
            using var search = await http.PostAsync(new Uri(new Uri(options.ImageApiUrl),"search/image"),form,ct);
            search.EnsureSuccessStatusCode();
            using var found = JsonDocument.Parse(await search.Content.ReadAsStringAsync(ct));
            var items = found.RootElement.GetProperty("results");
            var uncertain = found.RootElement.TryGetProperty("uncertain",out var flag) && flag.GetBoolean();
            match = items.GetArrayLength() == 0 ? new(null,null,null,true) :
                new(items[0].GetProperty("car_id").GetString(),
                    items[0].TryGetProperty("display_name",out var name) && name.ValueKind == JsonValueKind.String ? name.GetString() :
                        string.Join(" ",new[]{items[0].TryGetProperty("brand",out var brand) ? brand.GetString() : null,
                            items[0].TryGetProperty("model",out var model) ? model.GetString() : null}.Where(s=>!string.IsNullOrWhiteSpace(s))),
                    Math.Round(items[0].GetProperty("similarity").GetDouble()*100,1),uncertain);
        }
        return await orders.Send(sessionId,userId,new(input.RequestId,input.Version,question,input.OrderId,original,
            match,imageBytes == null ? null : $"data:{input.MimeType};base64,{input.ImageBase64}"),ct,hash);
    }
}
