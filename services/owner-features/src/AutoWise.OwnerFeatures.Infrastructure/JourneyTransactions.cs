using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using AutoWise.OwnerFeatures.Domain;
using Microsoft.EntityFrameworkCore;
namespace AutoWise.OwnerFeatures.Infrastructure;

public sealed class JourneyTransactions(OrdersDb db)
{
    public async Task<T> Run<T>(Guid actor, string key, string action, object input, Func<Task<T>> work, CancellationToken ct)
    {
        if (key.Length < 8 || key.Length > 100)
            throw new BusinessRuleException("Cần Idempotency-Key dài 8–100 ký tự.");
        var composite = actor + ":" + key;
        var hash = Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(action + JsonSerializer.Serialize(input, OrderStore.Json))));
        await using var tx = await db.Database.BeginTransactionAsync(ct);
        await Lock(composite, ct);
        var existing = await db.Requests.AsNoTracking().SingleOrDefaultAsync(x => x.Key == composite, ct);
        if (existing != null)
        {
            if (existing.Hash != hash)
                throw new VersionConflictException();
            return JsonSerializer.Deserialize<T>(existing.Response, OrderStore.Json)!;
        }
        var result = await work();
        db.Requests.Add(new()
        {
            Key = composite,
            Hash = hash,
            Response = JsonSerializer.Serialize(result, OrderStore.Json)
        });
        await db.SaveChangesAsync(ct);
        await tx.CommitAsync(ct);
        return result;
    }
    public Task Lock(string key, CancellationToken ct) => db.Database.ExecuteSqlInterpolatedAsync($"SELECT pg_advisory_xact_lock(hashtextextended({key},0))", ct);
    public static string Pack<T>(T value) => JsonSerializer.Serialize(value, OrderStore.Json);
    public static T Unpack<T>(string value) => JsonSerializer.Deserialize<T>(value, OrderStore.Json)!;
    public void Notify(Guid user, string eventKey, string title, string url) => db.Notifications.Add(new() { UserId = user, EventKey = eventKey, Title = title, DetailUrl = url });
}
