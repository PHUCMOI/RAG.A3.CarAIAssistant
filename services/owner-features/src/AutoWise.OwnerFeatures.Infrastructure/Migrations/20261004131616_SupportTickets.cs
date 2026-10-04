using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace AutoWise.OwnerFeatures.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class SupportTickets : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "support_tickets",
                schema: "orders_service",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    Code = table.Column<string>(type: "text", nullable: false),
                    CustomerId = table.Column<Guid>(type: "uuid", nullable: false),
                    SessionId = table.Column<Guid>(type: "uuid", nullable: false),
                    OrderId = table.Column<Guid>(type: "uuid", nullable: true),
                    PaymentId = table.Column<Guid>(type: "uuid", nullable: true),
                    ChangeRequestId = table.Column<Guid>(type: "uuid", nullable: true),
                    Subject = table.Column<string>(type: "character varying(150)", maxLength: 150, nullable: false),
                    Summary = table.Column<string>(type: "character varying(800)", maxLength: 800, nullable: false),
                    Status = table.Column<string>(type: "text", nullable: false),
                    AssignedTo = table.Column<Guid>(type: "uuid", nullable: true),
                    CreatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    Version = table.Column<long>(type: "bigint", nullable: false),
                    Snapshot = table.Column<string>(type: "jsonb", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_support_tickets", x => x.Id);
                    table.CheckConstraint("CK_support_status", "\"Status\" IN ('new','in_progress','resolved','closed')");
                    table.ForeignKey(
                        name: "FK_support_tickets_chat_sessions_SessionId",
                        column: x => x.SessionId,
                        principalSchema: "orders_service",
                        principalTable: "chat_sessions",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_support_tickets_order_change_requests_ChangeRequestId",
                        column: x => x.ChangeRequestId,
                        principalSchema: "orders_service",
                        principalTable: "order_change_requests",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_support_tickets_orders_OrderId",
                        column: x => x.OrderId,
                        principalSchema: "orders_service",
                        principalTable: "orders",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_support_tickets_users_AssignedTo",
                        column: x => x.AssignedTo,
                        principalSchema: "orders_service",
                        principalTable: "users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_support_tickets_users_CustomerId",
                        column: x => x.CustomerId,
                        principalSchema: "orders_service",
                        principalTable: "users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "support_audits",
                schema: "orders_service",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    TicketId = table.Column<Guid>(type: "uuid", nullable: false),
                    ActorId = table.Column<Guid>(type: "uuid", nullable: false),
                    Action = table.Column<string>(type: "text", nullable: false),
                    Version = table.Column<long>(type: "bigint", nullable: false),
                    At = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_support_audits", x => x.Id);
                    table.ForeignKey(
                        name: "FK_support_audits_support_tickets_TicketId",
                        column: x => x.TicketId,
                        principalSchema: "orders_service",
                        principalTable: "support_tickets",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_support_audits_users_ActorId",
                        column: x => x.ActorId,
                        principalSchema: "orders_service",
                        principalTable: "users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "support_replies",
                schema: "orders_service",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    TicketId = table.Column<Guid>(type: "uuid", nullable: false),
                    AuthorId = table.Column<Guid>(type: "uuid", nullable: false),
                    AuthorRole = table.Column<string>(type: "text", nullable: false),
                    Content = table.Column<string>(type: "character varying(1000)", maxLength: 1000, nullable: false),
                    Internal = table.Column<bool>(type: "boolean", nullable: false),
                    At = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_support_replies", x => x.Id);
                    table.ForeignKey(
                        name: "FK_support_replies_support_tickets_TicketId",
                        column: x => x.TicketId,
                        principalSchema: "orders_service",
                        principalTable: "support_tickets",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_support_replies_users_AuthorId",
                        column: x => x.AuthorId,
                        principalSchema: "orders_service",
                        principalTable: "users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "IX_support_audits_ActorId",
                schema: "orders_service",
                table: "support_audits",
                column: "ActorId");

            migrationBuilder.CreateIndex(
                name: "IX_support_audits_TicketId_Version",
                schema: "orders_service",
                table: "support_audits",
                columns: new[] { "TicketId", "Version" });

            migrationBuilder.CreateIndex(
                name: "IX_support_replies_AuthorId",
                schema: "orders_service",
                table: "support_replies",
                column: "AuthorId");

            migrationBuilder.CreateIndex(
                name: "IX_support_replies_TicketId_At",
                schema: "orders_service",
                table: "support_replies",
                columns: new[] { "TicketId", "At" });

            migrationBuilder.CreateIndex(
                name: "IX_support_tickets_AssignedTo",
                schema: "orders_service",
                table: "support_tickets",
                column: "AssignedTo");

            migrationBuilder.CreateIndex(
                name: "IX_support_tickets_ChangeRequestId",
                schema: "orders_service",
                table: "support_tickets",
                column: "ChangeRequestId");

            migrationBuilder.CreateIndex(
                name: "IX_support_tickets_Code",
                schema: "orders_service",
                table: "support_tickets",
                column: "Code",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_support_tickets_CustomerId_UpdatedAt",
                schema: "orders_service",
                table: "support_tickets",
                columns: new[] { "CustomerId", "UpdatedAt" });

            migrationBuilder.CreateIndex(
                name: "IX_support_tickets_OrderId",
                schema: "orders_service",
                table: "support_tickets",
                column: "OrderId");

            migrationBuilder.CreateIndex(
                name: "IX_support_tickets_SessionId",
                schema: "orders_service",
                table: "support_tickets",
                column: "SessionId");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "support_audits",
                schema: "orders_service");

            migrationBuilder.DropTable(
                name: "support_replies",
                schema: "orders_service");

            migrationBuilder.DropTable(
                name: "support_tickets",
                schema: "orders_service");
        }
    }
}
