using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace AutoWise.OwnerFeatures.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class OrderDocumentChecklist : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "order_document_checklist",
                schema: "orders_service",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    OrderId = table.Column<Guid>(type: "uuid", nullable: false),
                    Name = table.Column<string>(type: "character varying(150)", maxLength: 150, nullable: false),
                    Required = table.Column<bool>(type: "boolean", nullable: false),
                    Status = table.Column<string>(type: "text", nullable: false),
                    CustomerNote = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: true),
                    UpdatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    UpdatedBy = table.Column<Guid>(type: "uuid", nullable: false),
                    Version = table.Column<long>(type: "bigint", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_order_document_checklist", x => x.Id);
                    table.CheckConstraint("CK_document_status", "\"Status\" IN ('missing','pending','valid','needs_changes')");
                    table.ForeignKey(
                        name: "FK_order_document_checklist_orders_OrderId",
                        column: x => x.OrderId,
                        principalSchema: "orders_service",
                        principalTable: "orders",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_order_document_checklist_users_UpdatedBy",
                        column: x => x.UpdatedBy,
                        principalSchema: "orders_service",
                        principalTable: "users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "IX_order_document_checklist_OrderId_Name",
                schema: "orders_service",
                table: "order_document_checklist",
                columns: new[] { "OrderId", "Name" });

            migrationBuilder.CreateIndex(
                name: "IX_order_document_checklist_UpdatedBy",
                schema: "orders_service",
                table: "order_document_checklist",
                column: "UpdatedBy");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "order_document_checklist",
                schema: "orders_service");
        }
    }
}
