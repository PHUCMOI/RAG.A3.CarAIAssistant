namespace AutoWise.OwnerFeatures.Application;

public sealed record ConversationContext
{
    public int SchemaVersion { get; init; } = 1;
    public Guid? CurrentOrderId { get; init; }
    public Guid? PreviousOrderId { get; init; }
    public string? LastBusinessIntent { get; init; }
    public string? PendingClarification { get; init; }
    public string? PendingIntent { get; init; }
    public string Summary { get; init; } = "";
    public long CoveredThroughVersion { get; init; }
    public long SummaryVersion { get; init; }
    public DateTimeOffset? UpdatedAt { get; init; }

    public ConversationContext Remember(Guid orderId, string intent, DateTimeOffset now) => this with
    {
        PreviousOrderId = CurrentOrderId != orderId ? CurrentOrderId : PreviousOrderId,
        CurrentOrderId = orderId,
        LastBusinessIntent = IsBusinessIntent(intent) ? intent : LastBusinessIntent,
        PendingClarification = null,
        PendingIntent = null,
        UpdatedAt = now
    };

    public static bool IsBusinessIntent(string? intent) => intent is "status" or "payment" or "delivery" or "car" or "warranty";

    public static ConversationContext Recover(Guid? selectedOrderId, IEnumerable<ChatTurn> turns) => new()
    {
        CurrentOrderId = selectedOrderId,
        LastBusinessIntent = turns.SelectMany(t => t.Messages).Reverse().Select(m => m.Tool switch
        {
            "GetMyOrderStatus" => "status",
            "GetMyOrderPaymentSummary" => "payment",
            "GetMyDeliverySchedule" => "delivery",
            "GetCarDetail" => "car",
            "GetWarranty" => "warranty",
            _ => null
        }).FirstOrDefault(x => x != null)
    };
}

public sealed record ContextDecision(string Intent, string OrderReference, bool NeedsClarification, string? ClarificationKind);

public static class ConversationReferences
{
    public static ContextDecision Fallback(string question, ConversationContext context)
    {
        var text = AssistantIntent.Normalize(question);
        var intent = AssistantIntent.Resolve(question);
        var reference = AssistantIntent.OrderCode(question) != null ? "explicit"
            : text.Contains("don truoc") ? "previous" : "current";
        if (intent is "help" or "status" && context.LastBusinessIntent != null &&
            (text.Contains("thi sao") || text.Contains("con don") || text.Contains("don truoc")))
            intent = context.LastBusinessIntent;
        if(AssistantIntent.OrderCode(question)!=null && context.PendingIntent != null &&
            intent == "status" && !text.Contains("trang thai") && !text.Contains("tien do") && !text.Contains("den dau"))
            intent=context.PendingIntent;
        var missing = ConversationContext.IsBusinessIntent(intent) && reference != "explicit" &&
            (reference == "previous" ? context.PreviousOrderId == null : context.CurrentOrderId == null);
        var unresolved = context.PendingClarification == "order" && AssistantIntent.OrderCode(question)==null &&
            reference != "previous" && ConversationContext.IsBusinessIntent(intent);
        return new(intent, reference, missing || unresolved, missing || unresolved ? "order" : null);
    }

    public static bool IsValid(ContextDecision decision) =>
        decision.Intent is "help" or "readonly" or "list" or "status" or "payment" or "delivery" or "car" or "warranty"
            or "profile" or "security" or "requests" or "appointments" or "favorites" or "notifications" &&
        decision.OrderReference is "explicit" or "current" or "previous" or "none" &&
        decision.ClarificationKind is null or "order" or "topic" or "order_and_topic" &&
        decision.NeedsClarification == (decision.ClarificationKind != null);
}
