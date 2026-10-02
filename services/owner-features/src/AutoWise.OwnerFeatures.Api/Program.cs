using System.Security.Claims;
using AutoWise.OwnerFeatures.Api;
using AutoWise.OwnerFeatures.Application;
using AutoWise.OwnerFeatures.Domain;
using AutoWise.OwnerFeatures.Infrastructure;
using Microsoft.AspNetCore.Antiforgery;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authentication.Cookies;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.EntityFrameworkCore;
using System.Threading.RateLimiting;

var builder = WebApplication.CreateBuilder(args);
var connection = builder.Configuration["OrdersDatabase"] ?? "Host=localhost;Database=car_rag;Username=car_rag;Password=car_rag_dev";
builder.Services.AddDbContext<OrdersDb>(o => o.UseNpgsql(connection, np => np.MigrationsHistoryTable("__EFMigrationsHistory", "orders_service")));
builder.Services.AddScoped<OrderStore>();
builder.Services.AddScoped<IOrderAssistant, OrderAssistant>();
builder.Services.AddHttpClient<ICommonCatalogue, CommonCatalogue>(c => { c.BaseAddress = new(builder.Configuration["PythonApiUrl"] ?? "http://localhost:5080/"); c.Timeout = TimeSpan.FromSeconds(10); });
builder.Services.AddAntiforgery(o => { o.HeaderName = "X-CSRF-TOKEN"; o.Cookie.Name = "aw.orders.csrf"; o.Cookie.SameSite = SameSiteMode.Strict; });
builder.Services.AddAuthentication(CookieAuthenticationDefaults.AuthenticationScheme).AddCookie(o =>
{
    o.Cookie.Name = "aw.orders.session"; o.Cookie.HttpOnly = true; o.Cookie.SameSite = SameSiteMode.Strict;
    o.Cookie.SecurePolicy = builder.Environment.IsDevelopment() ? CookieSecurePolicy.SameAsRequest : CookieSecurePolicy.Always;
    o.ExpireTimeSpan = TimeSpan.FromHours(4);
    o.Events.OnRedirectToLogin = ctx => { ctx.Response.StatusCode = 401; return Task.CompletedTask; };
    o.Events.OnRedirectToAccessDenied = ctx => { ctx.Response.StatusCode = 403; return Task.CompletedTask; };
});
builder.Services.AddAuthorization();
builder.Services.AddRateLimiter(o => { o.RejectionStatusCode = 429; o.AddPolicy("login", ctx => RateLimitPartition.GetFixedWindowLimiter(ctx.Connection.RemoteIpAddress?.ToString() ?? "local", _ => new FixedWindowRateLimiterOptions { PermitLimit = 10, Window = TimeSpan.FromMinutes(1), QueueLimit = 0 })); });
var app = builder.Build();
app.Use(async (ctx, next) =>
{
    try { await next(); }
    catch (Exception ex)
    {
        var (code, detail) = ex switch
        {
            BusinessRuleException => (422, ex.Message),
            VersionConflictException => (409, ex.Message),
            KeyNotFoundException => (404, "Không tìm thấy bản ghi."),
            DbUpdateConcurrencyException => (409, "Dữ liệu đã thay đổi."),
            DbUpdateException => (409, "Dữ liệu bị trùng hoặc xung đột. Vui lòng tải lại."),
            HttpRequestException => (503, "API common Python chưa sẵn sàng."),
            TaskCanceledException => (503, "API common hết thời gian chờ."),
            _ => (500, "Không thể xử lý yêu cầu.")
        };
        if (code == 500) app.Logger.LogError(ex, "Orders request failed");
        if (!ctx.Response.HasStarted) await Results.Problem(statusCode: code, detail: detail).ExecuteAsync(ctx);
    }
});
app.UseRateLimiter(); app.UseAuthentication(); app.UseAuthorization();
app.Use(async (ctx, next) =>
{
    if (ctx.Request.Path.StartsWithSegments("/api/orders-service") && ctx.Request.Method is not ("GET" or "HEAD" or "OPTIONS"))
    {
        try { await ctx.RequestServices.GetRequiredService<IAntiforgery>().ValidateRequestAsync(ctx); }
        catch (AntiforgeryValidationException) { await Results.Problem(statusCode: 400, detail: "Phiên form hết hạn. Vui lòng tải lại.").ExecuteAsync(ctx); return; }
    }
    await next();
});
var api = app.MapGroup("/api/orders-service");
api.MapGet("/health", async (OrdersDb db) => await db.Database.CanConnectAsync() ? Results.Ok(new { status = "ok" }) : Results.StatusCode(503));
api.MapGet("/auth/csrf", (HttpContext ctx, IAntiforgery anti) => Results.Ok(new { token = anti.GetAndStoreTokens(ctx).RequestToken }));
api.MapPost("/auth/login", async (LoginRequest input, HttpContext ctx, OrdersDb db, CancellationToken ct) =>
{
    if (string.IsNullOrWhiteSpace(input.Email) || string.IsNullOrWhiteSpace(input.Password) || input.Email.Length > 254 || input.Password.Length > 256) return Results.Unauthorized();
    var user = await db.Users.SingleOrDefaultAsync(x => x.Email == input.Email.Trim().ToLowerInvariant(), ct);
    var hasher = new PasswordHasher<UserRecord>();
    if (user == null || hasher.VerifyHashedPassword(user, user.PasswordHash, input.Password) == PasswordVerificationResult.Failed) return Results.Unauthorized();
    var claims = new[] { new Claim(ClaimTypes.NameIdentifier, user.Id.ToString()), new Claim(ClaimTypes.Name, user.DisplayName), new Claim(ClaimTypes.Role, user.Role) };
    await ctx.SignInAsync(new ClaimsPrincipal(new ClaimsIdentity(claims, CookieAuthenticationDefaults.AuthenticationScheme)));
    return Results.Ok(new { user.Id, user.Email, user.DisplayName, user.Role });
}).RequireRateLimiting("login");
api.MapPost("/auth/logout", async (HttpContext ctx) => { await ctx.SignOutAsync(); return Results.NoContent(); }).RequireAuthorization();
api.MapGet("/me", (HttpContext ctx) => Results.Ok(new { id = Actor(ctx), displayName = ctx.User.Identity!.Name, role = ctx.User.FindFirstValue(ClaimTypes.Role) })).RequireAuthorization();
var mine = api.MapGroup("/my").RequireAuthorization(p => p.RequireRole("Customer"));
mine.MapGet("/orders", (HttpContext ctx, OrderStore store, int? page, int? pageSize, string? status, string? query, bool? delayed, CancellationToken ct) => store.List(Guid.Parse(Actor(ctx)), status, query, page ?? 1, pageSize ?? 20, delayed ?? false, ct));
mine.MapGet("/orders/{id:guid}", async (Guid id, HttpContext ctx, OrderStore store, CancellationToken ct) => await store.Get(id, Guid.Parse(Actor(ctx)), ct) is { } order ? Results.Ok(order) : Results.NotFound());
var assistant=api.MapGroup("/assistant").RequireAuthorization(p=>p.RequireRole("Customer"));
assistant.MapGet("/sessions",(HttpContext ctx,IOrderAssistant service,CancellationToken ct)=>service.List(Guid.Parse(Actor(ctx)),ct));
assistant.MapPost("/sessions",(CreateChatSessionRequest input,HttpContext ctx,IOrderAssistant service,CancellationToken ct)=>service.Create(Guid.Parse(Actor(ctx)),input.Id,ct));
assistant.MapGet("/sessions/{id:guid}",(Guid id,HttpContext ctx,IOrderAssistant service,CancellationToken ct)=>service.Get(id,Guid.Parse(Actor(ctx)),ct));
assistant.MapPost("/sessions/{id:guid}/messages",(Guid id,ChatInput input,HttpContext ctx,IOrderAssistant service,CancellationToken ct)=>service.Send(id,Guid.Parse(Actor(ctx)),input,ct));
var admin = api.MapGroup("/admin").RequireAuthorization(p => p.RequireRole("Admin"));
admin.MapGet("/customers", async (OrdersDb db, CancellationToken ct) => Results.Ok(await db.Users.Where(x => x.Role == "Customer").OrderBy(x => x.DisplayName).Select(x => new { x.Id, x.DisplayName, x.Email }).ToListAsync(ct)));
admin.MapPost("/customers", async (CustomerRequest input, OrdersDb db, CancellationToken ct) =>
{
    if (string.IsNullOrWhiteSpace(input.DisplayName) || input.DisplayName.Length > 100 || !System.Net.Mail.MailAddress.TryCreate(input.Email, out _) || input.Email.Length > 254 || string.IsNullOrEmpty(input.Password) || input.Password.Length < 12 || input.Password.Length > 128) throw new BusinessRuleException("Tên/email không hợp lệ; mật khẩu cần 12–128 ký tự.");
    var user = new UserRecord { Email = input.Email.Trim().ToLowerInvariant(), DisplayName = input.DisplayName.Trim() };
    user.PasswordHash = new PasswordHasher<UserRecord>().HashPassword(user, input.Password);
    db.Users.Add(user); await db.SaveChangesAsync(ct); return Results.Created("", new { user.Id, user.Email, user.DisplayName });
});
admin.MapGet("/orders", (OrderStore store, int? page, int? pageSize, string? status, string? query, bool? delayed, CancellationToken ct) => store.List(null, status, query, page ?? 1, pageSize ?? 20, delayed ?? false, ct));
admin.MapGet("/orders/{id:guid}", async (Guid id, OrderStore store, CancellationToken ct) => await store.Get(id, null, ct) is { } order ? Results.Ok(order) : Results.NotFound());
admin.MapPost("/orders", (CreateOrderRequest input, HttpContext ctx, OrderStore store, CancellationToken ct) => store.Create(input, Actor(ctx), Key(ctx), ct));
admin.MapPatch("/orders/{id:guid}", (Guid id, DraftRequest input, HttpContext ctx, OrderStore store, CancellationToken ct) => store.Mutate(id, input.Version, input, Actor(ctx), Key(ctx), "draft", o => o.EditDraft(input.TotalVnd, input.DepositRequiredVnd, input.Variant, input.Reason, Actor(ctx)), ct));
admin.MapPost("/orders/{id:guid}/transitions", (Guid id, TransitionRequest input, HttpContext ctx, OrderStore store, CancellationToken ct) => store.Mutate(id, input.Version, input, Actor(ctx), Key(ctx), "status", o => o.Transition(input.Status, input.Reason, Actor(ctx)), ct));
admin.MapPost("/orders/{id:guid}/payments", (Guid id, PaymentRequest input, HttpContext ctx, OrderStore store, CancellationToken ct) => store.Mutate(id, input.Version, input, Actor(ctx), Key(ctx), "payment", o => o.AddPayment(input.Type, input.AmountVnd, input.Reference, input.OriginalReceiptId, Actor(ctx)), ct));
admin.MapPost("/orders/{id:guid}/payments/{paymentId:guid}/confirm", (Guid id, Guid paymentId, ConfirmRequest input, HttpContext ctx, OrderStore store, CancellationToken ct) => store.Mutate(id, input.Version, input, Actor(ctx), Key(ctx), "confirm:" + paymentId, o => o.ConfirmPayment(paymentId, Actor(ctx)), ct));
admin.MapPost("/orders/{id:guid}/payments/{paymentId:guid}/fail", (Guid id, Guid paymentId, FailRequest input, HttpContext ctx, OrderStore store, CancellationToken ct) => store.Mutate(id, input.Version, input, Actor(ctx), Key(ctx), "fail:" + paymentId, o => o.FailPayment(paymentId, input.Reason, Actor(ctx)), ct));
admin.MapPut("/orders/{id:guid}/delivery", (Guid id, DeliveryRequest input, HttpContext ctx, OrderStore store, CancellationToken ct) => store.Mutate(id, input.Version, input, Actor(ctx), Key(ctx), "delivery", o => o.Schedule(input.PlannedDate, input.ActualHandoverAt, input.Location, input.Reason, Actor(ctx)), ct));
if (app.Environment.IsDevelopment() && app.Configuration.GetValue<bool>("MigrateOnStartup"))
{
    using var scope = app.Services.CreateScope(); var db = scope.ServiceProvider.GetRequiredService<OrdersDb>();
    await db.Database.MigrateAsync();
    if (app.Configuration.GetValue<bool>("SeedDemo")) await SeedData.Run(db, scope.ServiceProvider.GetRequiredService<ICommonCatalogue>(), CancellationToken.None);
}
await app.RunAsync();
static string Actor(HttpContext ctx) => ctx.User.FindFirstValue(ClaimTypes.NameIdentifier)!;
static string Key(HttpContext ctx) => ctx.Request.Headers["Idempotency-Key"].ToString();
