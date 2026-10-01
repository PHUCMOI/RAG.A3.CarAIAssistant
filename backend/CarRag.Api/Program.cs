using CarRag.Api.Data;
using CarRag.Api.Models;

var builder = WebApplication.CreateBuilder(args);
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen();
builder.Services.AddScoped<CarRepository>();
builder.Services.AddCors(options => options.AddDefaultPolicy(policy =>
    policy.WithOrigins(builder.Configuration["FrontendOrigin"] ?? "http://localhost:5173")
        .AllowAnyHeader().AllowAnyMethod()));

var app = builder.Build();
app.UseCors();
app.UseSwagger();
app.UseSwaggerUI();

app.MapGet("/api/health", async (CarRepository repository, CancellationToken ct) =>
{
    var ready = await repository.CanConnectAsync(ct);
    return ready ? Results.Ok(new { status = "ok", database = "ready" })
                 : Results.Problem("PostgreSQL is not ready", statusCode: 503);
});

app.MapGet("/api/cars", async (
    string? query, string? brand, string? bodyType, int? seats, long? maxPrice,
    int? limit, CarRepository repository, CancellationToken ct) =>
{
    var cars = await repository.SearchAsync(
        new CarSearchRequest(query, brand, bodyType, seats, maxPrice, Math.Clamp(limit ?? 20, 1, 100)), ct);
    return Results.Ok(new { count = cars.Count, items = cars });
});

app.MapGet("/api/cars/{carId}", async (string carId, CarRepository repository, CancellationToken ct) =>
{
    var car = await repository.GetByIdAsync(carId, ct);
    return car is null ? Results.NotFound() : Results.Ok(car);
});

app.MapGet("/api/dealers", async (
    string? brand, string? city, CarRepository repository, CancellationToken ct) =>
{
    var dealers = await repository.SearchDealersAsync(brand, city, ct);
    return Results.Ok(new { count = dealers.Count, items = dealers });
});

app.MapPost("/api/search/text", async (TextSearchRequest request, CarRepository repository, CancellationToken ct) =>
{
    var cars = await repository.SearchAsync(
        new CarSearchRequest(request.Query, request.Brand, request.BodyType, request.Seats, request.MaxPrice, Math.Clamp(request.TopK ?? 5, 1, 20)), ct);
    return Results.Ok(new { query = request.Query, results = cars, retrieval = "postgresql-structured-search" });
});

app.MapPost("/api/chat", async (ChatRequest request, CarRepository repository, CancellationToken ct) =>
{
    var cars = await repository.FindMentionedAsync(request.Question, 5, ct);
    if (cars.Count == 0)
        cars = await repository.SearchAsync(new CarSearchRequest(request.Question, null, null, null, null, 5), ct);
    return Results.Ok(new
    {
        answer = request.ImageName is not null
            ? "Ảnh đã được đính kèm thành công. Giao diện đã sẵn sàng; module nhận diện ảnh CLIP sẽ được nối ở bước tiếp theo. Dưới đây là context tìm được từ câu hỏi kèm theo."
            : cars.Count == 0
            ? "Chưa tìm thấy dữ liệu phù hợp trong bộ 50 xe."
            : "Đây là các mẫu xe phù hợp nhất trong dữ liệu hiện có. Module LLM/RAG sẽ được nối ở bước tiếp theo.",
        contexts = cars.Select(car => new { car.carId, car.displayName, car.description, car.presenceSourceId }),
        grounded = true
    });
});

app.Run();

