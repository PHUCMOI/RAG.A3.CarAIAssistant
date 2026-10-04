using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace AutoWise.OwnerFeatures.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class ConversationContext : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "Context",
                schema: "orders_service",
                table: "chat_sessions",
                type: "jsonb",
                nullable: false,
                defaultValue: "{}");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "Context",
                schema: "orders_service",
                table: "chat_sessions");
        }
    }
}
