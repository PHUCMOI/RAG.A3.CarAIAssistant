using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace AutoWise.OwnerFeatures.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class ChatAttachments : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "chat_attachments",
                schema: "orders_service",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    SessionId = table.Column<Guid>(type: "uuid", nullable: false),
                    Data = table.Column<byte[]>(type: "bytea", nullable: false),
                    MimeType = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_chat_attachments", x => x.Id);
                    table.CheckConstraint("CK_attachment_size", "octet_length(\"Data\") BETWEEN 1 AND 10000000");
                    table.ForeignKey(
                        name: "FK_chat_attachments_chat_sessions_SessionId",
                        column: x => x.SessionId,
                        principalSchema: "orders_service",
                        principalTable: "chat_sessions",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_chat_attachments_SessionId",
                schema: "orders_service",
                table: "chat_attachments",
                column: "SessionId");
            // Preserve valid historical photos while replacing inline JSON with authenticated URLs.
            migrationBuilder.Sql("""
                DO $$
                DECLARE r record; t record; m record; payload jsonb; url text; mime text; bytes bytea; attachment uuid;
                BEGIN
                  FOR r IN SELECT "Id", "Payload" FROM orders_service.chat_sessions FOR UPDATE LOOP
                    payload := r."Payload";
                    FOR t IN SELECT value, ordinality FROM jsonb_array_elements(payload) WITH ORDINALITY LOOP
                      FOR m IN SELECT value, ordinality FROM jsonb_array_elements(t.value->'messages') WITH ORDINALITY LOOP
                        url := m.value->>'imageUrl';
                        IF url LIKE 'data:%' THEN
                          mime := split_part(split_part(url, ';', 1), ':', 2);
                          bytes := NULL;
                          BEGIN
                            IF mime IN ('image/jpeg','image/png','image/webp') AND length(url) <= 14000050 THEN
                              bytes := decode(split_part(url, ',', 2), 'base64');
                            END IF;
                          EXCEPTION WHEN invalid_parameter_value OR invalid_text_representation THEN bytes := NULL;
                          END;
                          IF bytes IS NOT NULL AND octet_length(bytes) BETWEEN 1 AND 10000000 THEN
                            attachment := gen_random_uuid();
                            INSERT INTO orders_service.chat_attachments ("Id","SessionId","Data","MimeType") VALUES (attachment,r."Id",bytes,mime);
                            payload := jsonb_set(payload,ARRAY[(t.ordinality-1)::text,'messages',(m.ordinality-1)::text,'imageUrl'],
                              to_jsonb('/api/orders-service/assistant/sessions/' || r."Id"::text || '/attachments/' || attachment::text));
                          ELSE
                            payload := payload #- ARRAY[(t.ordinality-1)::text,'messages',(m.ordinality-1)::text,'imageUrl'];
                            payload := jsonb_set(payload,ARRAY[(t.ordinality-1)::text,'messages',(m.ordinality-1)::text,'content'],
                              to_jsonb(coalesce(m.value->>'content','') || ' [Ảnh cũ không hợp lệ; vui lòng gửi lại.]'));
                          END IF;
                        END IF;
                      END LOOP;
                    END LOOP;
                    IF payload <> r."Payload" THEN UPDATE orders_service.chat_sessions SET "Payload"=payload WHERE "Id"=r."Id"; END IF;
                  END LOOP;
                END $$;
                """);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql("""
                DO $$
                DECLARE r record; t record; m record; payload jsonb; a record;
                BEGIN
                  FOR r IN SELECT "Id","Payload" FROM orders_service.chat_sessions FOR UPDATE LOOP
                    payload := r."Payload";
                    FOR t IN SELECT value,ordinality FROM jsonb_array_elements(payload) WITH ORDINALITY LOOP
                      FOR m IN SELECT value,ordinality FROM jsonb_array_elements(t.value->'messages') WITH ORDINALITY LOOP
                        FOR a IN SELECT "Id","Data","MimeType" FROM orders_service.chat_attachments WHERE "SessionId"=r."Id" LOOP
                          IF m.value->>'imageUrl' = '/api/orders-service/assistant/sessions/' || r."Id"::text || '/attachments/' || a."Id"::text THEN
                            payload := jsonb_set(payload,ARRAY[(t.ordinality-1)::text,'messages',(m.ordinality-1)::text,'imageUrl'],
                              to_jsonb('data:' || a."MimeType" || ';base64,' || replace(encode(a."Data",'base64'), chr(10), '')));
                          END IF;
                        END LOOP;
                      END LOOP;
                    END LOOP;
                    UPDATE orders_service.chat_sessions SET "Payload"=payload WHERE "Id"=r."Id";
                  END LOOP;
                END $$;
                """);
            migrationBuilder.DropTable(
                name: "chat_attachments",
                schema: "orders_service");
        }
    }
}
