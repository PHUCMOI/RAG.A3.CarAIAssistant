using System.Text.RegularExpressions;

namespace AutoWise.OwnerFeatures.Application;

public record CatalogueReference(string Question, string? Clarification = null, bool Uncertain = false);

public static class CatalogueReferences
{
    public static CatalogueReference Resolve(string question, IEnumerable<ChatMessage> messages)
    {
        var normalized = AssistantIntent.Normalize(question);
        // Order references belong to the authenticated order tools.
        if (AssistantIntent.OrderCode(question) != null || Regex.IsMatch(normalized, @"\bdon(?: hang)?\b"))
            return new(question);
        const string previous = @"(?:(?:ben|o) tren|vua roi|truoc do)";
        var generic = Regex.IsMatch(normalized, @"\b(?:xe|mau(?: xe)?|chiec xe)\s+(?:do|nay|trong (?:anh|hinh)|" + previous + @")\b");
        if (!generic && !Regex.IsMatch(normalized, @"\b" + previous + @"\b"))
            return new(question);

        var history = messages.Where(m => m.Catalog && m.Role == "assistant" && m.Contexts?.Count > 0).Reverse().ToList();
        var brands = history.SelectMany(m => m.Contexts!).Select(c => AssistantIntent.Normalize(c.DisplayName).Split(' ')[0]).Distinct();
        var referencedBrands = brands.Where(brand => Regex.IsMatch(normalized,
            @"\b" + Regex.Escape(brand) + @"(?:\s+(?!(?:voi|va|ben|o|vua|truoc)\b)[a-z0-9-]+){0,2}\s+" + previous + @"\b")).ToList();
        if (!generic && referencedBrands.Count == 0)
            return new(question, "Bạn đang nhắc tới mẫu xe nào? Vui lòng ghi rõ tên mẫu xe để so sánh.");
        foreach (var message in history)
        {
            var candidates = message.Contexts!.DistinctBy(c => c.CarId)
                .Where(c => referencedBrands.Count == 0 || referencedBrands.Contains(AssistantIntent.Normalize(c.DisplayName).Split(' ')[0])).ToList();
            if (candidates.Count == 0) continue;
            var named = candidates.Where(c => Regex.IsMatch(normalized,
                @"\b" + Regex.Escape(AssistantIntent.Normalize(c.DisplayName)) + @"\s+" + previous + @"\b")).ToList();
            if (named.Count > 0) candidates = named;
            if (candidates.Count > 1)
                return new(question, "Bạn đang nhắc tới mẫu xe nào: " + string.Join(", ", candidates.Select(c => c.DisplayName)) + "?");
            var car = candidates[0];
            if (normalized.Contains(AssistantIntent.Normalize(car.DisplayName)))
                return new(question, Uncertain: message.Uncertain == true);
            var uncertainty = message.Uncertain == true
                ? " Đây là mẫu xe gần giống trong ảnh, kết quả nhận diện chưa chắc chắn; chưa xác minh chiếc xe thực tế." : "";
            return new(question + $" (Xe được nhắc từ lịch sử hội thoại: {car.DisplayName}.{uncertainty})",
                Uncertain: message.Uncertain == true);
        }
        return new(question, "Bạn đang nhắc tới mẫu xe nào? Vui lòng ghi rõ tên mẫu xe để so sánh.");
    }
}
