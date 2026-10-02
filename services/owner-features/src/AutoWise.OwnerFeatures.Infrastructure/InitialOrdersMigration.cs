using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
namespace AutoWise.OwnerFeatures.Infrastructure;

public sealed partial class InitialOrdersMigration : Migration
{
    protected override void Up(MigrationBuilder m) => m.Sql("""
        CREATE SCHEMA IF NOT EXISTS orders_service;
        CREATE TABLE orders_service.users (
          "Id" uuid PRIMARY KEY, "Email" text NOT NULL UNIQUE,
          "DisplayName" text NOT NULL, "PasswordHash" text NOT NULL,
          "Role" text NOT NULL CHECK ("Role" IN ('Admin','Customer')));
        CREATE TABLE orders_service.orders (
          "Id" uuid PRIMARY KEY, "Code" text NOT NULL UNIQUE,
          "CustomerId" uuid NOT NULL REFERENCES orders_service.users("Id"),
          "CreatedAt" timestamptz NOT NULL, "Status" text NOT NULL,
          "Version" bigint NOT NULL CHECK ("Version" > 0), "Payload" jsonb NOT NULL);
        CREATE INDEX "IX_orders_CustomerId_CreatedAt" ON orders_service.orders("CustomerId", "CreatedAt");
        CREATE TABLE orders_service.idempotency_requests (
          "Key" text PRIMARY KEY, "Hash" text NOT NULL,
          "Response" jsonb NOT NULL, "At" timestamptz NOT NULL);
        CREATE TABLE orders_service.payment_references (
          "Reference" text PRIMARY KEY, "OrderId" uuid NOT NULL REFERENCES orders_service.orders("Id"));
        """);
    protected override void Down(MigrationBuilder m) => m.Sql("""
        DROP TABLE orders_service.payment_references;
        DROP TABLE orders_service.idempotency_requests;
        DROP TABLE orders_service.orders;
        DROP TABLE orders_service.users;
        """);
}
