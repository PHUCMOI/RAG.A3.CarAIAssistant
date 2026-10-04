using System.Text.Json;
using AutoWise.OwnerFeatures.Application;
using AutoWise.OwnerFeatures.Domain;
using AutoWise.OwnerFeatures.Infrastructure;
using Microsoft.EntityFrameworkCore;
using Amazon;
using Amazon.BedrockRuntime;
using Amazon.BedrockRuntime.Model;
using Amazon.Runtime;
using Microsoft.Extensions.Logging.Abstractions;

public class MultiIntentDatabaseTests
{
    sealed class OverbroadModel : AmazonBedrockRuntimeClient
    {
        public OverbroadModel() : base(new AnonymousAWSCredentials(),RegionEndpoint.USEast1) {}
        public override Task<ConverseResponse> ConverseAsync(ConverseRequest request,CancellationToken ct=default) => Task.FromResult(new ConverseResponse {
            Output=new ConverseOutput {Message=new Message {Role=ConversationRole.Assistant,Content=[new ContentBlock {
                Text="{\"intents\":[\"status\",\"payment\",\"delivery\"],\"orderReference\":\"current\",\"needsClarification\":false,\"clarificationKind\":null}"
            }]}}
        });
    }
    sealed class Catalogue : ICommonCatalogue
    {
        public bool FailCar;
        public bool MissingWarranty;
        public bool Cancel;
        public Task<CarSnapshot> GetCar(string id,CancellationToken ct) => Cancel ? throw new OperationCanceledException(ct)
            : FailCar ? throw new HttpRequestException("Injected outage") : Task.FromResult(new CarSnapshot(id,"Catalogue car","Brand","source"));
        public Task<DealerSnapshot> GetDealer(long id,CancellationToken ct)=>throw new NotSupportedException();
        public Task<WarrantySnapshot?> GetWarranty(string id,string brand,CancellationToken ct)=>Task.FromResult<WarrantySnapshot?>(MissingWarranty ? null : new(36,100000,"conditions","source"));
    }

    static OrdersDb Open()=>new(new DbContextOptionsBuilder<OrdersDb>().UseNpgsql(Environment.GetEnvironmentVariable("CONTEXT_TEST_DATABASE")).Options);

    [ContextDatabaseFact]
    public async Task MultiTopicDialogueIsFreshOwnedPersistentAndIdempotentInBothContextModes()
    {
        foreach(var contextEnabled in new[]{true,false})
        {
            await using var db=Open();
            var user=new UserRecord {Email=$"multi-{Guid.NewGuid():N}@test.invalid",DisplayName="Multi test"};
            var other=new UserRecord {Email=$"multi-{Guid.NewGuid():N}@test.invalid",DisplayName="Other"};
            var first=new Order {CustomerId=user.Id,Code=$"AW-{Guid.NewGuid():N}".ToUpperInvariant(),TotalVnd=1000000,CarName="My car"};
            var second=new Order {CustomerId=user.Id,Code=$"AW-{Guid.NewGuid():N}".ToUpperInvariant(),TotalVnd=2000000,CarName="Second car"};
            var foreign=new Order {CustomerId=other.Id,Code=$"AW-{Guid.NewGuid():N}".ToUpperInvariant(),CarName="FOREIGN_SECRET"};
            OrderRecord Record(Order o)=>new(){Id=o.Id,Code=o.Code,CustomerId=o.CustomerId,Version=1,Payload=JsonSerializer.Serialize(o,OrderStore.Json)};
            db.Users.AddRange(user,other);db.Orders.AddRange(Record(first),Record(second),Record(foreign));
            await db.SaveChangesAsync();db.ChangeTracker.Clear();
            var catalogue=new Catalogue();
            using var client=new OverbroadModel();
            var options=new BedrockOptions {ContextEnabled=contextEnabled,SummaryEnabled=false};
            var provider=new BedrockAssistant(client,options,NullLogger<BedrockAssistant>.Instance);
            var service=new OrderAssistant(db,catalogue,provider,options);
            var session=await service.Create(user.Id,Guid.NewGuid(),default);
            async Task<ChatMessage> Send(string q,Guid? selection=null)
            {
                db.ChangeTracker.Clear();
                session=await service.Send(session.Id,user.Id,new(Guid.NewGuid(),session.Version,q,selection),default);
                return session.Messages.Last();
            }
            try
            {
                Assert.Null((await Send("Trạng thái, còn phải trả bao nhiêu và khi nào nhận xe?")).Sections);
                var reply=await Send(first.Code);
                Assert.Equal(new[]{"status","payment","delivery"},reply.Sections!.Select(s=>s.Topic));
                Assert.All(reply.Sections!,s=>Assert.Equal("success",s.ResultStatus));
                Assert.Equal(first.Code,reply.OrderCode);
                var reopened=await service.Get(session.Id,user.Id,default);
                Assert.Equal(3,reopened.Messages.Last().Sections!.Count);
                reply=await Send($"Còn đơn {second.Code} thì sao?");
                Assert.Equal(new[]{"status","payment","delivery"},reply.Sections!.Select(s=>s.Topic));
                Assert.Equal(second.Code,reply.OrderCode);
                Assert.Equal(new[]{"warranty"},(await Send("Còn bảo hành thì sao?")).Sections!.Select(s=>s.Topic));
                reply=await Send($"Thanh toán và lịch giao của {first.Code} và {second.Code}?");
                Assert.Null(reply.Sections);
                Assert.Null((await Send("Đơn này")).Sections);
                reply=await Send("Đơn này",first.Id);
                Assert.Equal(new[]{"payment","delivery"},reply.Sections!.Select(s=>s.Topic));
                Assert.Equal(first.Code,reply.OrderCode);
                // Explicitly confirming the already selected order also resolves ambiguity.
                Assert.Null((await Send($"Thanh toán và lịch giao của {first.Code} và {second.Code}?")).Sections);
                Assert.Null((await Send("Đơn này")).Sections);
                Assert.Equal(new[]{"payment","delivery"},(await Send("Đơn này",first.Id)).Sections!.Select(s=>s.Topic));
                catalogue.FailCar=true;
                reply=await Send("Thanh toán, thông tin xe, bảo hành và lịch giao?");
                Assert.Equal(new[]{"payment","car","warranty","delivery"},reply.Sections!.Select(s=>s.Topic));
                Assert.Equal(new[]{"success","error","success","success"},reply.Sections!.Select(s=>s.ResultStatus));
                var persisted=await db.ChatSessions.AsNoTracking().SingleAsync(s=>s.Id==session.Id);
                Assert.Equal(new[]{"payment","warranty","delivery"},JsonSerializer.Deserialize<ConversationContext>(persisted.Context,OrderStore.Json)!.LastBusinessIntents);
                catalogue.MissingWarranty=true;
                Assert.Equal("missing",(await Send("Bảo hành?")).Sections!.Single().ResultStatus);
                options.Enabled=true;
                Assert.Equal(new[]{"payment"},(await Send("Còn phải trả bao nhiêu?")).Sections!.Select(s=>s.Topic));
                Assert.Equal(new[]{"payment"},(await Send($"Còn đơn {second.Code} thì sao?")).Sections!.Select(s=>s.Topic));
                var request=new ChatInput(Guid.NewGuid(),session.Version,"Thanh toán và lịch giao?",null);
                session=await service.Send(session.Id,user.Id,request,default);
                Assert.Equal(new[]{"payment","delivery"},session.Messages.Last().Sections!.Select(s=>s.Topic));
                var replay=await service.Send(session.Id,user.Id,request,default);
                Assert.Equal(session.Version,replay.Version);Assert.Equal(session.Messages.Count,replay.Messages.Count);
                await Assert.ThrowsAsync<VersionConflictException>(()=>service.Send(session.Id,user.Id,request with {Content="Khác"},default));
                await Assert.ThrowsAsync<VersionConflictException>(()=>service.Send(session.Id,user.Id,new(Guid.NewGuid(),request.Version,"Khác",null),default));
                reply=await Send($"Thanh toán và lịch giao của {foreign.Code}?");
                Assert.Null(reply.Sections);Assert.Null(reply.OrderCode);Assert.DoesNotContain("FOREIGN_SECRET",reply.Content);
                await Assert.ThrowsAsync<KeyNotFoundException>(()=>service.Get(session.Id,other.Id,default));
                catalogue.Cancel=true;
                using var canceled=new CancellationTokenSource();canceled.Cancel();
                await Assert.ThrowsAnyAsync<OperationCanceledException>(()=>service.Send(session.Id,user.Id,new(Guid.NewGuid(),session.Version,"Thông tin xe?",first.Id),canceled.Token));
                Assert.Equal(session.Version,(await service.Get(session.Id,user.Id,default)).Version);
            }
            finally
            {
                db.ChangeTracker.Clear();
                await db.ChatSessions.Where(s=>s.UserId==user.Id || s.UserId==other.Id).ExecuteDeleteAsync();
                await db.Orders.Where(s=>s.CustomerId==user.Id || s.CustomerId==other.Id).ExecuteDeleteAsync();
                await db.Users.Where(s=>s.Id==user.Id || s.Id==other.Id).ExecuteDeleteAsync();
            }
        }
    }
}
