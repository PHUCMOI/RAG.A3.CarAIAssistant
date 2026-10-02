using AutoWise.OwnerFeatures.Domain;
namespace AutoWise.OwnerFeatures.Application;

public record CarSnapshot(string CarId, string DisplayName, string Brand, string? PriceSourceId);
public record DealerSnapshot(long DealerId, string Name, List<string> SupportedBrands);
public interface ICommonCatalogue
{
    Task<CarSnapshot> GetCar(string id, CancellationToken ct);
    Task<DealerSnapshot> GetDealer(long id, CancellationToken ct);
}
public record CreateOrderRequest(Guid CustomerId, string CarId, long DealerId, long TotalVnd, long DepositRequiredVnd, string? Variant);
public record TransitionRequest(long Version, string Status, string Reason);
public record PaymentRequest(long Version, string Type, long AmountVnd, string Reference, Guid? OriginalReceiptId);
public record ConfirmRequest(long Version);
public record FailRequest(long Version, string Reason);
public record DeliveryRequest(long Version, DateOnly? PlannedDate, DateTimeOffset? ActualHandoverAt, string Location, string Reason);
public record DraftRequest(long Version, long TotalVnd, long DepositRequiredVnd, string? Variant, string Reason);
public record CustomerRequest(string Email, string DisplayName, string Password);
public record LoginRequest(string Email, string Password);
public record Page<T>(List<T> Items, int PageNumber, int PageSize, int TotalCount);
