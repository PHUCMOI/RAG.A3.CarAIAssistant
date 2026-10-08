namespace AutoWise.OwnerFeatures.Application;

public sealed record ConversationContext
{
    public int SchemaVersion { get; init; } = 1;
    public string? Title { get; init; }
    public bool TitleGenerated { get; init; }
    public List<AssistantDraft> Drafts { get; init; } = [];
    public int LookupFailures { get; init; }
    public Guid? CurrentOrderId { get; init; }
    public Guid? PreviousOrderId { get; init; }
    public string? LastBusinessIntent { get; init; }
    public List<string>? LastBusinessIntents { get; init; }
    public string? PendingClarification { get; init; }
    public string? PendingIntent { get; init; }
    public List<string>? PendingIntents { get; init; }
    public string Summary { get; init; } = "";
    public long CoveredThroughVersion { get; init; }
    public long SummaryVersion { get; init; }
    public DateTimeOffset? UpdatedAt { get; init; }

    public ConversationContext Remember(Guid orderId, string intent, DateTimeOffset now) => this with
    {
        PreviousOrderId = CurrentOrderId != orderId ? CurrentOrderId : PreviousOrderId,
        CurrentOrderId = orderId,
        LastBusinessIntent = IsBusinessIntent(intent) ? intent : LastBusinessIntent,
        LastBusinessIntents = IsBusinessIntent(intent) ? [intent] : LastBusinessIntents,
        PendingClarification = null,
        PendingIntent = null,
        PendingIntents = null,
        UpdatedAt = now
    };

    public ConversationContext Remember(Guid orderId, List<string> intents, DateTimeOffset now) =>
        Remember(orderId, intents.Last(), now) with { LastBusinessIntents = intents };

    public static bool IsBusinessIntent(string? intent) => intent is "status" or "payment" or "delivery" or "car" or "warranty" or "documents";

    public static ConversationContext Recover(Guid? selectedOrderId, IEnumerable<ChatTurn> turns)
    {
        List<string> Topics(ChatMessage message)
        {
            if(message.Role != "assistant") return [];
            if(message.Sections != null) return message.Sections.Where(s => s.ResultStatus == "success").Select(s => s.Topic).ToList();
            var intent=message.Tool switch {
                "GetMyOrderStatus" or "GetMyOrderProgress" => "status", "GetMyOrderPaymentSummary" => "payment",
                "GetMyDeliverySchedule" => "delivery", "GetCarDetail" => "car", "GetWarranty" => "warranty", "GetMyOrderDocuments" => "documents", _ => null
            };
            return intent == null ? [] : [intent];
        }
        var recoveredTopics=turns.SelectMany(t => t.Messages).Reverse().Select(Topics).FirstOrDefault(t => t.Count > 0);
        return new()
        {
            CurrentOrderId=selectedOrderId,
            LastBusinessIntents=recoveredTopics,
            LastBusinessIntent=recoveredTopics?.LastOrDefault()
        };
    }
}

public sealed record ContextDecision(string Intent, string OrderReference, bool NeedsClarification, string? ClarificationKind, List<string>? Intents=null)
{
    public List<string> Topics => Intents ?? [Intent];
}

public static class ConversationReferences
{
    public static ContextDecision Fallback(string question, ConversationContext context)
    {
        var text = AssistantIntent.Normalize(question);
        var intent = AssistantIntent.Resolve(question);
        var topics = AssistantIntent.BusinessTopics(question);
        if (intent == "readonly" || intent == "list") topics = [];
        var reference = AssistantIntent.OrderCode(question) != null ? "explicit"
            : text.Contains("don truoc") ? "previous" : "current";
        if(topics.Count == 0 && context.PendingIntent != null && intent is "help" or "status")
            topics = context.PendingIntents ?? [context.PendingIntent];
        if (topics.Count == 0 && intent is "help" or "status" && context.LastBusinessIntent != null &&
            (text.Contains("thi sao") || text.Contains("con don") || text.Contains("don truoc")))
            topics = context.LastBusinessIntents ?? [context.LastBusinessIntent];
        if (topics.Count > 0) intent = topics[0];
        var missing = ConversationContext.IsBusinessIntent(intent) && reference != "explicit" &&
            (reference == "previous" ? context.PreviousOrderId == null : context.CurrentOrderId == null);
        var unresolved = context.PendingClarification == "order" && AssistantIntent.OrderCode(question)==null &&
            reference != "previous" && ConversationContext.IsBusinessIntent(intent);
        return new(intent, reference, missing || unresolved, missing || unresolved ? "order" : null, topics.Count > 0 ? topics : [intent]);
    }

    public static bool IsValid(ContextDecision decision) =>
        decision.Intent is "help" or "readonly" or "list" or "status" or "payment" or "delivery" or "car" or "warranty" or "documents"
            or "profile" or "security" or "requests" or "appointments" or "favorites" or "notifications" &&
        decision.OrderReference is "explicit" or "current" or "previous" or "none" &&
        decision.ClarificationKind is null or "order" or "topic" or "order_and_topic" &&
        decision.NeedsClarification == (decision.ClarificationKind != null) &&
        decision.Topics.Count is >= 1 and <= 5 &&
        decision.Topics.All(t => t == decision.Intent || ConversationContext.IsBusinessIntent(t)) &&
        decision.Topics[0] == decision.Intent &&
        (decision.Topics.Count == 1 || decision.Topics.All(ConversationContext.IsBusinessIntent));
}
