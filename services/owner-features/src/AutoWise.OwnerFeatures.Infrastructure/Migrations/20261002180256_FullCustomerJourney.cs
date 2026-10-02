using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace AutoWise.OwnerFeatures.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class FullCustomerJourney : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "CreatedAt",
                schema: "orders_service",
                table: "users",
                type: "timestamp with time zone",
                nullable: false,
                defaultValue: new DateTimeOffset(new DateTime(1, 1, 1, 0, 0, 0, 0, DateTimeKind.Unspecified), new TimeSpan(0, 0, 0, 0, 0)));

            migrationBuilder.AddColumn<bool>(
                name: "CreatedAtEstimated",
                schema: "orders_service",
                table: "users",
                type: "boolean",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<string>(
                name: "Phone",
                schema: "orders_service",
                table: "users",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<long>(
                name: "ProfileVersion",
                schema: "orders_service",
                table: "users",
                type: "bigint",
                nullable: false,
                defaultValue: 1L);

            migrationBuilder.AddColumn<long>(
                name: "SecurityVersion",
                schema: "orders_service",
                table: "users",
                type: "bigint",
                nullable: false,
                defaultValue: 1L);

            migrationBuilder.Sql("UPDATE orders_service.users SET \"CreatedAt\" = CURRENT_TIMESTAMP, \"CreatedAtEstimated\" = TRUE;");

            migrationBuilder.CreateTable(
                name: "appointment_slots",
                schema: "orders_service",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    DealerId = table.Column<long>(type: "bigint", nullable: false),
                    DealerName = table.Column<string>(type: "text", nullable: false),
                    StaffName = table.Column<string>(type: "text", nullable: false),
                    StartsAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    EndsAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_appointment_slots", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "favorites",
                schema: "orders_service",
                columns: table => new
                {
                    UserId = table.Column<Guid>(type: "uuid", nullable: false),
                    CarId = table.Column<string>(type: "text", nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_favorites", x => new { x.UserId, x.CarId });
                    table.ForeignKey(
                        name: "FK_favorites_users_UserId",
                        column: x => x.UserId,
                        principalSchema: "orders_service",
                        principalTable: "users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "notifications",
                schema: "orders_service",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    UserId = table.Column<Guid>(type: "uuid", nullable: false),
                    EventKey = table.Column<string>(type: "text", nullable: false),
                    Title = table.Column<string>(type: "text", nullable: false),
                    DetailUrl = table.Column<string>(type: "text", nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    ReadAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_notifications", x => x.Id);
                    table.ForeignKey(
                        name: "FK_notifications_users_UserId",
                        column: x => x.UserId,
                        principalSchema: "orders_service",
                        principalTable: "users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "order_change_requests",
                schema: "orders_service",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    CustomerId = table.Column<Guid>(type: "uuid", nullable: false),
                    OrderId = table.Column<Guid>(type: "uuid", nullable: false),
                    Type = table.Column<string>(type: "text", nullable: false),
                    Reason = table.Column<string>(type: "text", nullable: false),
                    Status = table.Column<string>(type: "text", nullable: false),
                    Response = table.Column<string>(type: "text", nullable: true),
                    ReviewedBy = table.Column<Guid>(type: "uuid", nullable: true),
                    ReviewedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    Version = table.Column<long>(type: "bigint", nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_order_change_requests", x => x.Id);
                    table.ForeignKey(
                        name: "FK_order_change_requests_orders_OrderId",
                        column: x => x.OrderId,
                        principalSchema: "orders_service",
                        principalTable: "orders",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_order_change_requests_users_CustomerId",
                        column: x => x.CustomerId,
                        principalSchema: "orders_service",
                        principalTable: "users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_order_change_requests_users_ReviewedBy",
                        column: x => x.ReviewedBy,
                        principalSchema: "orders_service",
                        principalTable: "users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "purchase_requests",
                schema: "orders_service",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    Code = table.Column<string>(type: "text", nullable: false),
                    CustomerId = table.Column<Guid>(type: "uuid", nullable: false),
                    Status = table.Column<string>(type: "text", nullable: false),
                    Version = table.Column<long>(type: "bigint", nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    AssignedAdminId = table.Column<Guid>(type: "uuid", nullable: true),
                    OrderId = table.Column<Guid>(type: "uuid", nullable: true),
                    Payload = table.Column<string>(type: "jsonb", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_purchase_requests", x => x.Id);
                    table.ForeignKey(
                        name: "FK_purchase_requests_orders_OrderId",
                        column: x => x.OrderId,
                        principalSchema: "orders_service",
                        principalTable: "orders",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_purchase_requests_users_AssignedAdminId",
                        column: x => x.AssignedAdminId,
                        principalSchema: "orders_service",
                        principalTable: "users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_purchase_requests_users_CustomerId",
                        column: x => x.CustomerId,
                        principalSchema: "orders_service",
                        principalTable: "users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "appointments",
                schema: "orders_service",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    CustomerId = table.Column<Guid>(type: "uuid", nullable: false),
                    SlotId = table.Column<Guid>(type: "uuid", nullable: false),
                    Status = table.Column<string>(type: "text", nullable: false),
                    Version = table.Column<long>(type: "bigint", nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    Payload = table.Column<string>(type: "jsonb", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_appointments", x => x.Id);
                    table.ForeignKey(
                        name: "FK_appointments_appointment_slots_SlotId",
                        column: x => x.SlotId,
                        principalSchema: "orders_service",
                        principalTable: "appointment_slots",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_appointments_users_CustomerId",
                        column: x => x.CustomerId,
                        principalSchema: "orders_service",
                        principalTable: "users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "IX_appointment_slots_DealerId_StartsAt",
                schema: "orders_service",
                table: "appointment_slots",
                columns: new[] { "DealerId", "StartsAt" });

            migrationBuilder.CreateIndex(
                name: "IX_appointments_CustomerId_CreatedAt",
                schema: "orders_service",
                table: "appointments",
                columns: new[] { "CustomerId", "CreatedAt" });

            migrationBuilder.CreateIndex(
                name: "IX_appointments_SlotId",
                schema: "orders_service",
                table: "appointments",
                column: "SlotId",
                unique: true,
                filter: "\"Status\" IN ('requested','proposed','confirmed')");

            migrationBuilder.CreateIndex(
                name: "IX_notifications_UserId_CreatedAt",
                schema: "orders_service",
                table: "notifications",
                columns: new[] { "UserId", "CreatedAt" });

            migrationBuilder.CreateIndex(
                name: "IX_notifications_UserId_EventKey",
                schema: "orders_service",
                table: "notifications",
                columns: new[] { "UserId", "EventKey" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_order_change_requests_CustomerId_CreatedAt",
                schema: "orders_service",
                table: "order_change_requests",
                columns: new[] { "CustomerId", "CreatedAt" });

            migrationBuilder.CreateIndex(
                name: "IX_order_change_requests_OrderId",
                schema: "orders_service",
                table: "order_change_requests",
                column: "OrderId",
                unique: true,
                filter: "\"Status\" = 'pending'");

            migrationBuilder.CreateIndex(
                name: "IX_order_change_requests_ReviewedBy",
                schema: "orders_service",
                table: "order_change_requests",
                column: "ReviewedBy");

            migrationBuilder.CreateIndex(
                name: "IX_purchase_requests_AssignedAdminId",
                schema: "orders_service",
                table: "purchase_requests",
                column: "AssignedAdminId");

            migrationBuilder.CreateIndex(
                name: "IX_purchase_requests_Code",
                schema: "orders_service",
                table: "purchase_requests",
                column: "Code",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_purchase_requests_CustomerId_CreatedAt",
                schema: "orders_service",
                table: "purchase_requests",
                columns: new[] { "CustomerId", "CreatedAt" });

            migrationBuilder.CreateIndex(
                name: "IX_purchase_requests_OrderId",
                schema: "orders_service",
                table: "purchase_requests",
                column: "OrderId",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_purchase_requests_Status_CreatedAt",
                schema: "orders_service",
                table: "purchase_requests",
                columns: new[] { "Status", "CreatedAt" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "appointments",
                schema: "orders_service");

            migrationBuilder.DropTable(
                name: "favorites",
                schema: "orders_service");

            migrationBuilder.DropTable(
                name: "notifications",
                schema: "orders_service");

            migrationBuilder.DropTable(
                name: "order_change_requests",
                schema: "orders_service");

            migrationBuilder.DropTable(
                name: "purchase_requests",
                schema: "orders_service");

            migrationBuilder.DropTable(
                name: "appointment_slots",
                schema: "orders_service");

            migrationBuilder.DropColumn(
                name: "CreatedAt",
                schema: "orders_service",
                table: "users");

            migrationBuilder.DropColumn(
                name: "CreatedAtEstimated",
                schema: "orders_service",
                table: "users");

            migrationBuilder.DropColumn(
                name: "Phone",
                schema: "orders_service",
                table: "users");

            migrationBuilder.DropColumn(
                name: "ProfileVersion",
                schema: "orders_service",
                table: "users");

            migrationBuilder.DropColumn(
                name: "SecurityVersion",
                schema: "orders_service",
                table: "users");
        }
    }
}
