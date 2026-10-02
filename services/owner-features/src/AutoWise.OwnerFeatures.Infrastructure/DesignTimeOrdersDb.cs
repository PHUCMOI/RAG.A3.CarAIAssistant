using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Design;
namespace AutoWise.OwnerFeatures.Infrastructure;

public sealed class DesignTimeOrdersDb : IDesignTimeDbContextFactory<OrdersDb>
{
    public OrdersDb CreateDbContext(string[] args) => new(new DbContextOptionsBuilder<OrdersDb>().UseNpgsql(Environment.GetEnvironmentVariable("OrdersDatabase") ?? "Host=localhost;Database=car_rag;Username=car_rag;Password=car_rag_dev", np => np.MigrationsHistoryTable("__EFMigrationsHistory", "orders_service")).Options);
}
