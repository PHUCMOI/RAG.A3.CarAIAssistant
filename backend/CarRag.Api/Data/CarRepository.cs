using System.Text.Json;
using CarRag.Api.Models;
using Npgsql;
using NpgsqlTypes;

namespace CarRag.Api.Data;

public sealed class CarRepository(IConfiguration configuration)
{
    private readonly string _connectionString = configuration.GetConnectionString("Postgres")
        ?? throw new InvalidOperationException("ConnectionStrings:Postgres is required.");

    public async Task<bool> CanConnectAsync(CancellationToken ct)
    {
        try
        {
            await using var connection = new NpgsqlConnection(_connectionString);
            await connection.OpenAsync(ct);
            return true;
        }
        catch (NpgsqlException)
        {
            return false;
        }
    }

    public async Task<List<CarDto>> SearchAsync(CarSearchRequest request, CancellationToken ct)
    {
        const string sql = """
            SELECT car_id, genmodel_id, brand_name, display_name, description, aliases::text,
                   market_status_vn, body_type, fuel_type, transmission, seats, engine,
                   price_vnd_from, price_as_of, price_source_id, warranty_months, warranty_distance_km,
                   presence_source_id, missing_fields::text, image_count
            FROM cars
            WHERE (@query IS NULL OR display_name ILIKE '%' || @query || '%'
                   OR source_model_name ILIKE '%' || @query || '%'
                   OR aliases::text ILIKE '%' || @query || '%')
              AND (@brand IS NULL OR brand_name ILIKE @brand)
              AND (@body_type IS NULL OR body_type ILIKE @body_type)
              AND (@seats IS NULL OR seats = @seats)
              AND (@max_price IS NULL OR price_vnd_from <= @max_price)
            ORDER BY price_vnd_from NULLS LAST, display_name
            LIMIT @limit;
            """;

        var result = new List<CarDto>();
        await using var connection = new NpgsqlConnection(_connectionString);
        await connection.OpenAsync(ct);
        await using var command = new NpgsqlCommand(sql, connection);
        command.Parameters.Add("query", NpgsqlDbType.Text).Value = (object?)NullIfWhiteSpace(request.Query) ?? DBNull.Value;
        command.Parameters.Add("brand", NpgsqlDbType.Text).Value = (object?)NullIfWhiteSpace(request.Brand) ?? DBNull.Value;
        command.Parameters.Add("body_type", NpgsqlDbType.Text).Value = (object?)NullIfWhiteSpace(request.BodyType) ?? DBNull.Value;
        command.Parameters.Add("seats", NpgsqlDbType.Integer).Value = (object?)request.Seats ?? DBNull.Value;
        command.Parameters.Add("max_price", NpgsqlDbType.Bigint).Value = (object?)request.MaxPrice ?? DBNull.Value;
        command.Parameters.AddWithValue("limit", request.Limit);
        await using var reader = await command.ExecuteReaderAsync(ct);
        while (await reader.ReadAsync(ct)) result.Add(Map(reader));
        return result;
    }

    public async Task<List<CarDto>> FindMentionedAsync(string question, int limit, CancellationToken ct)
    {
        const string sql = """
            SELECT car_id, genmodel_id, brand_name, display_name, description, aliases::text,
                   market_status_vn, body_type, fuel_type, transmission, seats, engine,
                   price_vnd_from, price_as_of, price_source_id, warranty_months, warranty_distance_km,
                   presence_source_id, missing_fields::text, image_count
            FROM cars
            WHERE lower(@question) LIKE '%' || lower(display_name) || '%'
               OR EXISTS (
                    SELECT 1
                    FROM jsonb_array_elements_text(aliases) AS alias(value)
                    WHERE length(alias.value) >= 3
                      AND lower(@question) LIKE '%' || lower(alias.value) || '%'
               )
            ORDER BY length(display_name) DESC, display_name
            LIMIT @limit;
            """;

        var result = new List<CarDto>();
        await using var connection = new NpgsqlConnection(_connectionString);
        await connection.OpenAsync(ct);
        await using var command = new NpgsqlCommand(sql, connection);
        command.Parameters.AddWithValue("question", question.Trim());
        command.Parameters.AddWithValue("limit", Math.Clamp(limit, 1, 20));
        await using var reader = await command.ExecuteReaderAsync(ct);
        while (await reader.ReadAsync(ct)) result.Add(Map(reader));
        return result;
    }

    public async Task<CarDto?> GetByIdAsync(string carId, CancellationToken ct)
    {
        const string sql = """
            SELECT car_id, genmodel_id, brand_name, display_name, description, aliases::text,
                   market_status_vn, body_type, fuel_type, transmission, seats, engine,
                   price_vnd_from, price_as_of, price_source_id, warranty_months, warranty_distance_km,
                   presence_source_id, missing_fields::text, image_count
            FROM cars WHERE car_id = @car_id;
            """;
        await using var connection = new NpgsqlConnection(_connectionString);
        await connection.OpenAsync(ct);
        await using var command = new NpgsqlCommand(sql, connection);
        command.Parameters.AddWithValue("car_id", carId);
        await using var reader = await command.ExecuteReaderAsync(ct);
        return await reader.ReadAsync(ct) ? Map(reader) : null;
    }

    public async Task<List<DealerDto>> SearchDealersAsync(string? brand, string? city, CancellationToken ct)
    {
        const string sql = """
            SELECT dealer_id, name, address, city, phone, website,
                   supported_brands::text, source_id, checked_at
            FROM dealers
            WHERE (@brand IS NULL OR supported_brands @> jsonb_build_array(@brand::text))
              AND (@city IS NULL OR city ILIKE @city)
            ORDER BY city, name;
            """;
        var result = new List<DealerDto>();
        await using var connection = new NpgsqlConnection(_connectionString);
        await connection.OpenAsync(ct);
        await using var command = new NpgsqlCommand(sql, connection);
        command.Parameters.Add("brand", NpgsqlDbType.Text).Value = (object?)NullIfWhiteSpace(brand) ?? DBNull.Value;
        command.Parameters.Add("city", NpgsqlDbType.Text).Value = (object?)NullIfWhiteSpace(city) ?? DBNull.Value;
        await using var reader = await command.ExecuteReaderAsync(ct);
        while (await reader.ReadAsync(ct))
        {
            result.Add(new DealerDto(
                reader.GetInt64(0), reader.GetString(1), reader.GetString(2), reader.GetString(3),
                reader.IsDBNull(4) ? null : reader.GetString(4), reader.IsDBNull(5) ? null : reader.GetString(5),
                JsonSerializer.Deserialize<string[]>(reader.GetString(6)) ?? [],
                reader.IsDBNull(7) ? null : reader.GetString(7), reader.GetDateTime(8)));
        }
        return result;
    }

    private static CarDto Map(NpgsqlDataReader reader) => new(
        reader.GetString(0), reader.GetString(1), reader.GetString(2), reader.GetString(3), reader.GetString(4),
        JsonSerializer.Deserialize<string[]>(reader.GetString(5)) ?? [], reader.GetString(6),
        reader.IsDBNull(7) ? null : reader.GetString(7), reader.IsDBNull(8) ? null : reader.GetString(8),
        reader.IsDBNull(9) ? null : reader.GetString(9), reader.IsDBNull(10) ? null : reader.GetInt32(10),
        reader.IsDBNull(11) ? null : reader.GetString(11), reader.IsDBNull(12) ? null : reader.GetInt64(12),
        reader.IsDBNull(13) ? null : reader.GetDateTime(13), reader.IsDBNull(14) ? null : reader.GetString(14),
        reader.IsDBNull(15) ? null : reader.GetInt32(15), reader.IsDBNull(16) ? null : reader.GetInt32(16),
        reader.GetString(17), JsonSerializer.Deserialize<string[]>(reader.GetString(18)) ?? [], reader.GetInt32(19));

    private static string? NullIfWhiteSpace(string? value) => string.IsNullOrWhiteSpace(value) ? null : value.Trim();
}

public sealed record CarDto(
    string carId, string genmodelId, string brand, string displayName, string description, string[] aliases,
    string marketStatusVn, string? bodyType, string? fuelType, string? transmission,
    int? seats, string? engine, long? priceVndFrom, DateTime? priceAsOf, string? priceSourceId,
    int? warrantyMonths, int? warrantyDistanceKm, string presenceSourceId,
    string[] missingFields, int imageCount);

public sealed record DealerDto(
    long dealerId, string name, string address, string city, string? phone, string? website,
    string[] supportedBrands, string? sourceId, DateTime checkedAt);

