using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace AutoWise.OwnerFeatures.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class ProactiveNotifications : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_notifications_UserId_EventKey",
                schema: "orders_service",
                table: "notifications");

            migrationBuilder.AddColumn<bool>(
                name: "DeliveryRemindersEnabled",
                schema: "orders_service",
                table: "users",
                type: "boolean",
                nullable: false,
                defaultValue: true);

            migrationBuilder.AddColumn<string>(
                name: "ChatUrl",
                schema: "orders_service",
                table: "notifications",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "Type",
                schema: "orders_service",
                table: "notifications",
                type: "text",
                nullable: false,
                defaultValue: "business");

            migrationBuilder.CreateTable(
                name: "notification_outbox",
                schema: "orders_service",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    UserId = table.Column<Guid>(type: "uuid", nullable: false),
                    EventKey = table.Column<string>(type: "text", nullable: false),
                    Type = table.Column<string>(type: "text", nullable: false),
                    Title = table.Column<string>(type: "text", nullable: false),
                    DetailUrl = table.Column<string>(type: "text", nullable: false),
                    OrderId = table.Column<Guid>(type: "uuid", nullable: true),
                    ScheduleVersion = table.Column<long>(type: "bigint", nullable: true),
                    PlannedDate = table.Column<DateOnly>(type: "date", nullable: true),
                    CreatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    DueAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    Status = table.Column<string>(type: "text", nullable: false),
                    Attempts = table.Column<int>(type: "integer", nullable: false),
                    ErrorCode = table.Column<string>(type: "text", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_notification_outbox", x => x.Id);
                    table.ForeignKey(
                        name: "FK_notification_outbox_users_UserId",
                        column: x => x.UserId,
                        principalSchema: "orders_service",
                        principalTable: "users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_notifications_UserId_EventKey_Type",
                schema: "orders_service",
                table: "notifications",
                columns: new[] { "UserId", "EventKey", "Type" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_notification_outbox_OrderId",
                schema: "orders_service",
                table: "notification_outbox",
                column: "OrderId");

            migrationBuilder.CreateIndex(
                name: "IX_notification_outbox_Status_DueAt",
                schema: "orders_service",
                table: "notification_outbox",
                columns: new[] { "Status", "DueAt" });

            migrationBuilder.CreateIndex(
                name: "IX_notification_outbox_UserId_EventKey_Type",
                schema: "orders_service",
                table: "notification_outbox",
                columns: new[] { "UserId", "EventKey", "Type" },
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "notification_outbox",
                schema: "orders_service");

            migrationBuilder.DropIndex(
                name: "IX_notifications_UserId_EventKey_Type",
                schema: "orders_service",
                table: "notifications");

            migrationBuilder.DropColumn(
                name: "DeliveryRemindersEnabled",
                schema: "orders_service",
                table: "users");

            migrationBuilder.DropColumn(
                name: "ChatUrl",
                schema: "orders_service",
                table: "notifications");

            migrationBuilder.DropColumn(
                name: "Type",
                schema: "orders_service",
                table: "notifications");

            migrationBuilder.CreateIndex(
                name: "IX_notifications_UserId_EventKey",
                schema: "orders_service",
                table: "notifications",
                columns: new[] { "UserId", "EventKey" },
                unique: true);
        }
    }
}
