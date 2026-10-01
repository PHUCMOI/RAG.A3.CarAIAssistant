namespace CarRag.Api.Models;

public sealed record CarSearchRequest(
    string? Query, string? Brand, string? BodyType, int? Seats, long? MaxPrice, int Limit);

public sealed record TextSearchRequest(
    string Query, string? Brand, string? BodyType, int? Seats, long? MaxPrice, int? TopK);

public sealed record ChatRequest(string Question, string? ImageName = null);

