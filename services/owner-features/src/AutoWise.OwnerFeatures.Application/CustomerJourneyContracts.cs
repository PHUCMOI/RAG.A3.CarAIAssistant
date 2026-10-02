namespace AutoWise.OwnerFeatures.Application;

public record ProfileUpdate(long Version, string DisplayName, string? Phone);
public record PasswordUpdate(string CurrentPassword, string NewPassword, string ConfirmPassword);
public record PurchaseInput(string CarId, long DealerId, string? Variant, string Phone, string ContactMethod, string? Notes, long Version = 0);
public record JourneyAction(long Version, string? Reason = null, long TotalVnd = 0, long DepositRequiredVnd = 0, string? Variant = null);
public record ChangeInput(Guid OrderId, string Type, string Reason);
public record DecisionInput(long Version, string Decision, string Reason);
public record SlotInput(long DealerId, DateTimeOffset StartsAt, DateTimeOffset EndsAt, string StaffName);
public record AppointmentInput(string CarId, Guid SlotId, string Kind, string Phone, string? Notes);
public record AppointmentAction(long Version, string Action, string Reason, Guid? SlotId = null);
public record FavoriteInput(string CarId);
