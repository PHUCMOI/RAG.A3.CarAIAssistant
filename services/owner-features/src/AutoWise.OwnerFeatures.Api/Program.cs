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
builder.Services.AddScoped<JourneyTransactions>();
builder.Services.AddSingleton(TimeProvider.System);
builder.Services.AddScoped<NotificationDelivery>();
builder.Services.AddHostedService<NotificationWorker>();
builder.Services.AddScoped<PurchaseStore>();
builder.Services.AddScoped<CustomerAccountStore>();
builder.Services.AddScoped<AssistantDraftActions>();
builder.Services.AddScoped<OrderEvidenceStore>();
builder.Services.AddScoped<SupportStore>();
builder.Services.AddScoped<AppointmentStore>();
builder.Services.AddScoped<IOrderAssistant, OrderAssistant>();
builder.Services.AddHttpClient<NaturalAnswers>(c => { c.BaseAddress = new(builder.Configuration["PythonApiUrl"] ?? "http://localhost:5080/"); c.Timeout = TimeSpan.FromSeconds(90); });
builder.Services.AddHttpClient<ConversationTitles>(c => { c.BaseAddress = new(builder.Configuration["PythonApiUrl"] ?? "http://localhost:5080/"); c.Timeout = TimeSpan.FromSeconds(10); });
builder.Services.AddSingleton(new CatalogueChatOptions(builder.Configuration["ImageApiUrl"] ?? "http://localhost:8000/"));
builder.Services.AddHttpClient<CatalogueAssistant>(c => { c.BaseAddress = new(builder.Configuration["PythonApiUrl"] ?? "http://localhost:5080/"); c.Timeout = TimeSpan.FromSeconds(90); });
var bedrockOptions = new BedrockOptions();
builder.Configuration.GetSection("Bedrock").Bind(bedrockOptions);
builder.Services.AddSingleton(bedrockOptions);
if (bedrockOptions.Enabled)
{
    builder.Services.AddSingleton<Amazon.BedrockRuntime.IAmazonBedrockRuntime>(_ =>
        new Amazon.BedrockRuntime.AmazonBedrockRuntimeClient(new Amazon.BedrockRuntime.AmazonBedrockRuntimeConfig
        {
            RegionEndpoint = Amazon.RegionEndpoint.GetBySystemName(bedrockOptions.Region),
            MaxErrorRetry = 0
        }));
    builder.Services.AddScoped<BedrockAssistant>();
}
builder.Services.AddHttpClient<ICommonCatalogue, CommonCatalogue>(c => { c.BaseAddress = new(builder.Configuration["PythonApiUrl"] ?? "http://localhost:5080/"); c.Timeout = TimeSpan.FromSeconds(10); });
builder.Services.AddAntiforgery(o => { o.HeaderName = "X-CSRF-TOKEN"; o.Cookie.Name = "aw.orders.csrf"; o.Cookie.SameSite = SameSiteMode.Strict; });
builder.Services.AddAuthentication(CookieAuthenticationDefaults.AuthenticationScheme).AddCookie(o =>
{
    o.Cookie.Name = "aw.orders.session"; o.Cookie.HttpOnly = true; o.Cookie.SameSite = SameSiteMode.Strict;
    o.Cookie.SecurePolicy = builder.Environment.IsDevelopment() ? CookieSecurePolicy.SameAsRequest : CookieSecurePolicy.Always;
    o.ExpireTimeSpan = TimeSpan.FromHours(4);
    o.Events.OnValidatePrincipal = async ctx => {
        var id=ctx.Principal?.FindFirstValue(ClaimTypes.NameIdentifier);
        var stamp=ctx.Principal?.FindFirstValue("security_version");
        if(!Guid.TryParse(id,out var userId)){ctx.RejectPrincipal();return;}
        var user=await ctx.HttpContext.RequestServices.GetRequiredService<OrdersDb>().Users.AsNoTracking().SingleOrDefaultAsync(x=>x.Id==userId,ctx.HttpContext.RequestAborted);
        if(user==null||stamp!=user.SecurityVersion.ToString()||ctx.Principal?.FindFirstValue(ClaimTypes.Role)!=user.Role){ctx.RejectPrincipal();await ctx.HttpContext.SignOutAsync();}
    };
    o.Events.OnRedirectToLogin = ctx => { ctx.Response.StatusCode = 401; return Task.CompletedTask; };
    o.Events.OnRedirectToAccessDenied = ctx => { ctx.Response.StatusCode = 403; return Task.CompletedTask; };
});
builder.Services.AddAuthorization();
builder.Services.AddRateLimiter(o => { o.RejectionStatusCode = 429; o.AddPolicy("password", ctx => RateLimitPartition.GetFixedWindowLimiter(ctx.User.FindFirstValue(ClaimTypes.NameIdentifier) ?? "anonymous", _ => new FixedWindowRateLimiterOptions {PermitLimit=5,Window=TimeSpan.FromMinutes(5),QueueLimit=0})); o.AddPolicy("login", ctx => RateLimitPartition.GetFixedWindowLimiter(ctx.Connection.RemoteIpAddress?.ToString() ?? "local", _ => new FixedWindowRateLimiterOptions { PermitLimit = 10, Window = TimeSpan.FromMinutes(1), QueueLimit = 0 })); });
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
            HttpRequestException => (503, "Dịch vụ tư vấn chưa tạo được câu trả lời. Vui lòng thử lại."),
            TaskCanceledException => (503, "API common hết thời gian chờ."),
            _ => (500, "Không thể xử lý yêu cầu.")
        };
        if (code == 500) app.Logger.LogError(ex, "Orders request failed");
        if (!ctx.Response.HasStarted) await Results.Problem(statusCode: code, detail: detail).ExecuteAsync(ctx);
    }
});
app.UseAuthentication(); app.UseRateLimiter(); app.UseAuthorization();
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
api.MapJourney();
api.MapGet("/health", async (OrdersDb db) => await db.Database.CanConnectAsync() ? Results.Ok(new { status = "ok" }) : Results.StatusCode(503));
api.MapGet("/auth/csrf", (HttpContext ctx, IAntiforgery anti) => Results.Ok(new { token = anti.GetAndStoreTokens(ctx).RequestToken }));
api.MapPost("/auth/login", async (LoginRequest input, HttpContext ctx, OrdersDb db, CancellationToken ct) =>
{
    if (string.IsNullOrWhiteSpace(input.Email) || string.IsNullOrWhiteSpace(input.Password) || input.Email.Length > 254 || input.Password.Length > 256) return Results.Unauthorized();
    var user = await db.Users.SingleOrDefaultAsync(x => x.Email == input.Email.Trim().ToLowerInvariant(), ct);
    var hasher = new PasswordHasher<UserRecord>();
    if (user == null || hasher.VerifyHashedPassword(user, user.PasswordHash, input.Password) == PasswordVerificationResult.Failed) return Results.Unauthorized();
    var claims = new[] { new Claim(ClaimTypes.NameIdentifier, user.Id.ToString()), new Claim(ClaimTypes.Name, user.DisplayName), new Claim(ClaimTypes.Role, user.Role), new Claim("security_version",user.SecurityVersion.ToString()) };
    await ctx.SignInAsync(new ClaimsPrincipal(new ClaimsIdentity(claims, CookieAuthenticationDefaults.AuthenticationScheme)));
    return Results.Ok(new { user.Id, user.Email, user.DisplayName, user.Role });
}).RequireRateLimiting("login");
api.MapPost("/auth/logout", async (HttpContext ctx) => { await ctx.SignOutAsync(); return Results.NoContent(); }).RequireAuthorization();
api.MapGet("/me", async (HttpContext ctx,OrdersDb db,CancellationToken ct) => {var userId=Guid.Parse(Actor(ctx));var u=await db.Users.AsNoTracking().SingleAsync(x=>x.Id==userId,ct);return Results.Ok(new{u.Id,u.DisplayName,u.Email,u.Role});}).RequireAuthorization();
var mine = api.MapGroup("/my").RequireAuthorization(p => p.RequireRole("Customer"));
mine.MapGet("/orders", (HttpContext ctx, OrderStore store, int? page, int? pageSize, string? status, string? query, bool? delayed, CancellationToken ct) => store.List(Guid.Parse(Actor(ctx)), status, query, page ?? 1, pageSize ?? 20, delayed ?? false, ct));
mine.MapGet("/orders/{id:guid}", async (Guid id, HttpContext ctx, OrderStore store, CancellationToken ct) => await store.Get(id, Guid.Parse(Actor(ctx)), ct) is { } order ? Results.Ok(order) : Results.NotFound());
mine.MapGet("/orders/{id:guid}/payment-details",(Guid id,int? page,int? pageSize,string? reference,DateOnly? date,HttpContext ctx,OrderEvidenceStore store,CancellationToken ct)=>store.Payments(id,Guid.Parse(Actor(ctx)),page??1,pageSize??10,reference,date,ct));
mine.MapGet("/orders/{id:guid}/payments/{paymentId:guid}",(Guid id,Guid paymentId,HttpContext ctx,OrderEvidenceStore store,CancellationToken ct)=>store.Payment(id,paymentId,Guid.Parse(Actor(ctx)),ct));
mine.MapGet("/orders/{id:guid}/documents",(Guid id,int? page,int? pageSize,HttpContext ctx,OrderEvidenceStore store,CancellationToken ct)=>store.Documents(id,Guid.Parse(Actor(ctx)),page??1,pageSize??10,ct));
mine.MapGet("/support-tickets",(int? page,int? pageSize,HttpContext ctx,SupportStore store,CancellationToken ct)=>store.List(Guid.Parse(Actor(ctx)),page??1,pageSize??20,ct));
mine.MapGet("/support-tickets/{id:guid}",(Guid id,int? page,HttpContext ctx,SupportStore store,CancellationToken ct)=>store.Get(id,Guid.Parse(Actor(ctx)),page??1,20,ct));
mine.MapPost("/support-tickets/{id:guid}/replies",(Guid id,TicketReplyInput input,HttpContext ctx,SupportStore store,CancellationToken ct)=>store.Reply(id,Guid.Parse(Actor(ctx)),false,input,Key(ctx),ct));
var assistant=api.MapGroup("/assistant").RequireAuthorization(p=>p.RequireRole("Customer"));
assistant.MapPost("/sessions/{id:guid}/title",(Guid id,HttpContext ctx,ConversationTitles service,CancellationToken ct)=>service.Generate(id,Guid.Parse(Actor(ctx)),ct));
assistant.MapPost("/sessions/{id:guid}/catalogue-messages",(Guid id,CatalogueChatInput input,HttpContext ctx,CatalogueAssistant service,CancellationToken ct)=>service.Send(id,Guid.Parse(Actor(ctx)),input,ct));
assistant.MapGet("/sessions",(HttpContext ctx,IOrderAssistant service,CancellationToken ct)=>service.List(Guid.Parse(Actor(ctx)),ct));
assistant.MapPost("/sessions",(CreateChatSessionRequest input,HttpContext ctx,IOrderAssistant service,CancellationToken ct)=>service.Create(Guid.Parse(Actor(ctx)),input.Id,ct));
assistant.MapGet("/sessions/{id:guid}",(Guid id,HttpContext ctx,IOrderAssistant service,CancellationToken ct)=>service.Get(id,Guid.Parse(Actor(ctx)),ct));
assistant.MapPost("/sessions/{id:guid}/messages",(Guid id,ChatInput input,HttpContext ctx,IOrderAssistant service,CancellationToken ct)=>service.Send(id,Guid.Parse(Actor(ctx)),input,ct));
assistant.MapPost("/sessions/{id:guid}/draft-actions",(Guid id,DraftAction input,HttpContext ctx,AssistantDraftActions service,CancellationToken ct)=>service.Act(id,Guid.Parse(Actor(ctx)),input,ct));
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
admin.MapGet("/orders/{id:guid}/payment-details",(Guid id,int? page,int? pageSize,string? reference,DateOnly? date,OrderEvidenceStore store,CancellationToken ct)=>store.Payments(id,null,page??1,pageSize??10,reference,date,ct));
admin.MapGet("/orders/{id:guid}/documents",(Guid id,int? page,int? pageSize,OrderEvidenceStore store,CancellationToken ct)=>store.Documents(id,null,page??1,pageSize??10,ct));
admin.MapGet("/support-tickets",(int? page,int? pageSize,SupportStore store,CancellationToken ct)=>store.List(null,page??1,pageSize??20,ct));
admin.MapGet("/support-tickets/{id:guid}",(Guid id,int? page,SupportStore store,CancellationToken ct)=>store.Get(id,null,page??1,20,ct));
admin.MapPost("/support-tickets/{id:guid}/replies",(Guid id,TicketReplyInput input,HttpContext ctx,SupportStore store,CancellationToken ct)=>store.Reply(id,Guid.Parse(Actor(ctx)),true,input,Key(ctx),ct));
admin.MapPost("/support-tickets/{id:guid}/actions",(Guid id,TicketActionInput input,HttpContext ctx,SupportStore store,CancellationToken ct)=>store.Act(id,Guid.Parse(Actor(ctx)),input,Key(ctx),ct));
admin.MapPut("/orders/{id:guid}/documents/{itemId:guid}",(Guid id,Guid itemId,DocumentInput input,HttpContext ctx,OrderEvidenceStore store,CancellationToken ct)=>store.Save(id,itemId,Guid.Parse(Actor(ctx)),input,Key(ctx),ct));
admin.MapPost("/orders", (CreateOrderRequest input, HttpContext ctx, OrderStore store, CancellationToken ct) => store.Create(input, Actor(ctx), Key(ctx), ct));
admin.MapPatch("/orders/{id:guid}", (Guid id, DraftRequest input, HttpContext ctx, OrderStore store, CancellationToken ct) => store.Mutate(id, input.Version, input, Actor(ctx), Key(ctx), "draft", o => o.EditDraft(input.TotalVnd, input.DepositRequiredVnd, input.Variant, input.Reason, Actor(ctx)), ct));
admin.MapPost("/orders/{id:guid}/transitions", (Guid id, TransitionRequest input, HttpContext ctx, OrderStore store, CancellationToken ct) => store.Mutate(id, input.Version, input, Actor(ctx), Key(ctx), "status", o => o.Transition(input.Status, input.Reason, Actor(ctx)), ct));
admin.MapPost("/orders/{id:guid}/payments", (Guid id, PaymentRequest input, HttpContext ctx, OrderStore store, CancellationToken ct) => store.Mutate(id, input.Version, input, Actor(ctx), Key(ctx), "payment", o => o.AddPayment(input.Type, input.AmountVnd, input.Reference, input.OriginalReceiptId, Actor(ctx)), ct));
admin.MapPost("/orders/{id:guid}/payments/{paymentId:guid}/confirm", (Guid id, Guid paymentId, ConfirmRequest input, HttpContext ctx, OrderStore store, CancellationToken ct) => store.Mutate(id, input.Version, input, Actor(ctx), Key(ctx), "confirm:" + paymentId, o => o.ConfirmPayment(paymentId, Actor(ctx)), ct));
admin.MapPost("/orders/{id:guid}/payments/{paymentId:guid}/fail", (Guid id, Guid paymentId, FailRequest input, HttpContext ctx, OrderStore store, CancellationToken ct) => store.Mutate(id, input.Version, input, Actor(ctx), Key(ctx), "fail:" + paymentId, o => o.FailPayment(paymentId, input.Reason, Actor(ctx)), ct));
admin.MapPut("/orders/{id:guid}/delivery", (Guid id, DeliveryRequest input, HttpContext ctx, OrderStore store, CancellationToken ct) => store.Mutate(id, input.Version, input, Actor(ctx), Key(ctx), "delivery", o => o.Schedule(input.PlannedDate, input.ActualHandoverAt, input.Location, input.Reason, Actor(ctx), input.Confirmed), ct));
admin.MapPut("/orders/{id:guid}/progress-note", (Guid id, ProgressNoteRequest input, HttpContext ctx, OrderStore store, CancellationToken ct) => store.Mutate(id, input.Version, input, Actor(ctx), Key(ctx), "progress-note", o => o.UpdateCustomerWaitingReason(input.CustomerWaitingReason, input.Reason, Actor(ctx)), ct));
if (app.Environment.IsDevelopment() && app.Configuration.GetValue<bool>("MigrateOnStartup"))
{
    using var scope = app.Services.CreateScope(); var db = scope.ServiceProvider.GetRequiredService<OrdersDb>();
    await db.Database.MigrateAsync();
    if (app.Configuration.GetValue<bool>("SeedDemo")) {
        var common=scope.ServiceProvider.GetRequiredService<ICommonCatalogue>();
        await SeedData.Run(db,common,CancellationToken.None);
        await JourneySeed.Run(db,common,CancellationToken.None);
    }
}
await app.RunAsync();
static string Actor(HttpContext ctx) => ctx.User.FindFirstValue(ClaimTypes.NameIdentifier)!;
static string Key(HttpContext ctx) => ctx.Request.Headers["Idempotency-Key"].ToString();
