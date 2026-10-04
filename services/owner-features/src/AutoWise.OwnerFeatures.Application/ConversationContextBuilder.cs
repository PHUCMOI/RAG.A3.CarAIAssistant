using System.Text.Json;
using System.Text;
using System.Text.Encodings.Web;
using AutoWise.OwnerFeatures.Domain;

namespace AutoWise.OwnerFeatures.Application;

public static class ConversationContextBuilder
{
    // UTF-8 bytes provide a conservative proxy; reserve room for the fixed
    // system prompt. Actual token usage is recorded from Bedrock, not inferred.
    public static string Build(string question, ConversationContext context, IReadOnlyList<ChatTurn> turns,
        int historyWindow = 8, int inputBudget = 6000)
    {
        var budget = Math.Clamp(inputBudget, 3000, 32000)-1500;
        var history = turns.TakeLast(Math.Clamp(historyWindow, 1, 20))
            .Select(t => new { messages = t.Messages.Select(m => new
            {
                role = m.Role,
                // Never re-use financial/status text as model truth. Successful tools
                // are sufficient to reconstruct topic transitions.
                text = m.Role == "user" ? m.Content : null,
                tool = m.Role == "assistant" ? m.Tool : null
            }).ToArray() }).ToList();
        var summary = context.Summary.Length <= 800 ? context.Summary : context.Summary[..800];
        string Serialize() => JsonSerializer.Serialize(new
        {
            memory = new { hasCurrentOrder = context.CurrentOrderId != null, hasPreviousOrder = context.PreviousOrderId != null,
                lastBusinessIntent = context.LastBusinessIntent, pendingClarification = context.PendingClarification, pendingIntent=context.PendingIntent },
            summary, history, question
        },new JsonSerializerOptions {Encoder=JavaScriptEncoder.UnsafeRelaxedJsonEscaping});
        var result = Serialize();
        while (Encoding.UTF8.GetByteCount(result) > budget && history.Count > 0) { history.RemoveAt(0); result = Serialize(); }
        if (Encoding.UTF8.GetByteCount(result) > budget) { summary = ""; result = Serialize(); }
        if(Encoding.UTF8.GetByteCount(result)>budget)
            throw new BusinessRuleException("Câu hỏi vượt ngân sách ngữ cảnh đã cấu hình. Hãy rút ngắn câu hỏi hoặc tăng InputBudget.");
        return result;
    }
}
