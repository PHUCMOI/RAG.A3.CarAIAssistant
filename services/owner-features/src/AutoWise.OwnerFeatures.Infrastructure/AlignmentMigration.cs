using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
namespace AutoWise.OwnerFeatures.Infrastructure;

[DbContext(typeof(OrdersDb))]
[Migration("20261002160000_AlignConstraintNames")]
public sealed class AlignmentMigration : Migration
{
    protected override void Up(MigrationBuilder m) => m.Sql("""
        ALTER TABLE orders_service.users RENAME CONSTRAINT "users_pkey" TO "PK_users";
        ALTER TABLE orders_service.users RENAME CONSTRAINT "users_Email_key" TO "IX_users_Email";
        ALTER TABLE orders_service.users RENAME CONSTRAINT "users_Role_check" TO "CK_users_Role";
        ALTER TABLE orders_service.orders RENAME CONSTRAINT "orders_pkey" TO "PK_orders";
        ALTER TABLE orders_service.orders RENAME CONSTRAINT "orders_Code_key" TO "IX_orders_Code";
        ALTER TABLE orders_service.orders RENAME CONSTRAINT "orders_Version_check" TO "CK_orders_Version";
        ALTER TABLE orders_service.orders RENAME CONSTRAINT "orders_CustomerId_fkey" TO "FK_orders_users_CustomerId";
        ALTER TABLE orders_service.idempotency_requests RENAME CONSTRAINT "idempotency_requests_pkey" TO "PK_idempotency_requests";
        ALTER TABLE orders_service.payment_references RENAME CONSTRAINT "payment_references_pkey" TO "PK_payment_references";
        ALTER TABLE orders_service.payment_references RENAME CONSTRAINT "payment_references_OrderId_fkey" TO "FK_payment_references_orders_OrderId";
        CREATE INDEX "IX_payment_references_OrderId" ON orders_service.payment_references("OrderId");
        """);
    protected override void Down(MigrationBuilder m) => m.Sql("""
        DROP INDEX orders_service."IX_payment_references_OrderId";
        ALTER TABLE orders_service.users RENAME CONSTRAINT "PK_users" TO "users_pkey";
        ALTER TABLE orders_service.users RENAME CONSTRAINT "IX_users_Email" TO "users_Email_key";
        ALTER TABLE orders_service.users RENAME CONSTRAINT "CK_users_Role" TO "users_Role_check";
        ALTER TABLE orders_service.orders RENAME CONSTRAINT "PK_orders" TO "orders_pkey";
        ALTER TABLE orders_service.orders RENAME CONSTRAINT "IX_orders_Code" TO "orders_Code_key";
        ALTER TABLE orders_service.orders RENAME CONSTRAINT "CK_orders_Version" TO "orders_Version_check";
        ALTER TABLE orders_service.orders RENAME CONSTRAINT "FK_orders_users_CustomerId" TO "orders_CustomerId_fkey";
        ALTER TABLE orders_service.idempotency_requests RENAME CONSTRAINT "PK_idempotency_requests" TO "idempotency_requests_pkey";
        ALTER TABLE orders_service.payment_references RENAME CONSTRAINT "PK_payment_references" TO "payment_references_pkey";
        ALTER TABLE orders_service.payment_references RENAME CONSTRAINT "FK_payment_references_orders_OrderId" TO "payment_references_OrderId_fkey";
        """);
}
