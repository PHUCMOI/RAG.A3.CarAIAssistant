using System.Net.Http.Json;
using System.Text.Json;
using System.Text.RegularExpressions;
using AutoWise.OwnerFeatures.Application;
using Microsoft.EntityFrameworkCore;
namespace AutoWise.OwnerFeatures.Infrastructure;

public sealed class ConversationTitles(OrdersDb db, HttpClient http)
{
    public async Task<ChatSession> Generate(Guid id, Guid userId, CancellationToken ct)
    {
        var row=await db.ChatSessions.AsNoTracking().SingleOrDefaultAsync(s=>s.Id==id && s.UserId==userId,ct) ?? throw new KeyNotFoundException();
        var context=JsonSerializer.Deserialize<ConversationContext>(row.Context,OrderStore.Json) ?? new();
        var session=OrderAssistant.View(row);
        if(context.TitleGenerated || session.Messages.Count==0) return session;
        // Send only brief topics, never image data or structured account evidence.
        string Clean(string text) => Regex.Replace(text,@"(?i)\bAW-[A-Z0-9-]+\b|\S+@\S+|\b\d[\d .+-]{6,}\d\b","[ẩn]");
        var questions=session.Messages.Where(m=>m.Role=="user").Take(3).Select(m=>Clean(m.Content)).ToList();
        var cars=session.Messages.SelectMany(m=>m.Contexts ?? []).Select(c=>c.DisplayName).Distinct().Take(3);
        var content=string.Join("\n",questions.Concat(cars));
        if(content.Length>2400)content=content[..2400];
        string? title=null;
        try {
            using var response=await http.PostAsJsonAsync("api/chat/title",new{content},ct);
            if(response.IsSuccessStatusCode) {
                using var data=JsonDocument.Parse(await response.Content.ReadAsStringAsync(ct));
                title=data.RootElement.GetProperty("title").GetString()?.Trim();
                if(string.IsNullOrWhiteSpace(title)||title.Length>80||title.Contains('\n')||title.Contains('<')||title.Contains('>'))title=null;
            }
        } catch(OperationCanceledException) when(ct.IsCancellationRequested) {throw;}
        catch(Exception ex) when(ex is HttpRequestException or OperationCanceledException or JsonException or KeyNotFoundException or InvalidOperationException) { }
        await using var tx=await db.Database.BeginTransactionAsync(ct);
        await db.Database.ExecuteSqlInterpolatedAsync($"SELECT pg_advisory_xact_lock(hashtextextended({id.ToString()},0))",ct);
        var current=await db.ChatSessions.SingleAsync(s=>s.Id==id&&s.UserId==userId,ct);
        context=JsonSerializer.Deserialize<ConversationContext>(current.Context,OrderStore.Json) ?? new();
        if(!context.TitleGenerated) {
            current.Context=JsonSerializer.Serialize(context with {Title=title,TitleGenerated=title!=null},OrderStore.Json);
            await db.SaveChangesAsync(ct);
        }
        await tx.CommitAsync(ct);
        return OrderAssistant.View(current);
    }
}
