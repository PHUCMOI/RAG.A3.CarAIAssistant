using System.Text.Json;
using Amazon;
using Amazon.BedrockRuntime;
using Amazon.BedrockRuntime.Model;
using Amazon.Runtime;
using AutoWise.OwnerFeatures.Application;
using AutoWise.OwnerFeatures.Infrastructure;
using Microsoft.Extensions.Logging.Abstractions;

public class MultiIntentTests
{
    [Theory]
    [InlineData("Đơn AW-001 đang đến đâu, còn phải trả bao nhiêu và khi nào nhận xe?", "status,payment,delivery")]
    [InlineData("Khi nào nhận xe, còn nợ bao nhiêu, xe bảo hành thế nào?", "delivery,payment,warranty")]
    [InlineData("Thanh toán bao nhiêu, đã trả bao nhiêu?", "payment")]
    [InlineData("Xe trong đơn được bảo hành thế nào?", "warranty")]
    [InlineData("Thông số xe và bảo hành", "car,warranty")]
    [InlineData("Trạng thái, thanh toán, lịch giao, thông tin xe và bảo hành", "status,payment,delivery,car,warranty")]
    public void RulesFindTopicsInQuestionOrderWithoutDuplicates(string question,string expected)
        => Assert.Equal(expected.Split(','),AssistantIntent.BusinessTopics(question));

    [Fact]
    public void AccountNavigationStillWorksWhenProviderIsUnavailable()
        => Assert.Equal("security",ConversationReferences.Fallback("Mở trang đổi mật khẩu",new()).Intent);

    [Fact]
    public void PendingTopicsAndOrderSwitchPreserveEveryQuestion()
    {
        var context=new ConversationContext {PendingClarification="order",PendingIntent="payment",PendingIntents=["payment","delivery"]};
        Assert.Equal(new[]{"payment","delivery"},ConversationReferences.Fallback("AW-001",context).Topics);
        context=context with {LastBusinessIntent="status",LastBusinessIntents=["status"],CurrentOrderId=Guid.NewGuid(),PreviousOrderId=Guid.NewGuid()};
        Assert.Equal(new[]{"payment","delivery"},ConversationReferences.Fallback("Đơn trước",context).Topics);
        context=new ConversationContext().Remember(Guid.NewGuid(),["status","payment","delivery"],DateTimeOffset.UtcNow);
        Assert.Equal(new[]{"status","payment","delivery"},ConversationReferences.Fallback("Còn đơn AW-002 thì sao?",context).Topics);
        Assert.Equal(new[]{"warranty"},ConversationReferences.Fallback("Còn bảo hành thì sao?",context).Topics);
    }

    [Fact]
    public void OldMessagesAndContextDeserializeAndNewSessionsRecoverSuccessfulTopics()
    {
        var message=JsonSerializer.Deserialize<ChatMessage>("{\"role\":\"assistant\",\"content\":\"cũ\",\"at\":\"2026-10-04T00:00:00Z\",\"tool\":\"GetMyOrderPaymentSummary\"}",OrderStore.Json)!;
        Assert.Null(message.Sections);
        var legacy=JsonSerializer.Deserialize<ConversationContext>("{\"lastBusinessIntent\":\"payment\"}",OrderStore.Json)!;
        Assert.Equal("payment",ConversationReferences.Fallback("Còn đơn AW-002 thì sao?",legacy).Intent);
        var now=DateTimeOffset.UtcNow;
        var current=message with {Tool="GetMyOrderTopics",Sections=[new("payment","SECRET", "success",now),new("car","FAILED","error",now),new("delivery","DATE","success",now)]};
        var context=ConversationContext.Recover(Guid.NewGuid(),[new(Guid.NewGuid(),"h",[current])]);
        Assert.Equal(new[]{"payment","delivery"},context.LastBusinessIntents);
        Assert.Equal(new[]{"payment","delivery"},ConversationReferences.Fallback("Còn đơn AW-002 thì sao?",context).Topics);
        var prompt=ConversationContextBuilder.Build("Còn đơn đó?",context,[new(Guid.NewGuid(),"h",[current])]);
        Assert.DoesNotContain("SECRET",prompt);
        Assert.DoesNotContain("FAILED",prompt);
        Assert.DoesNotContain("DATE",prompt);
    }

    [Theory]
    [InlineData("[\"payment\",\"delivery\",\"payment\"]",true)]
    [InlineData("[]",false)]
    [InlineData("[\"payment\",\"admin\"]",false)]
    [InlineData("[\"payment\",\"list\"]",false)]
    [InlineData("[\"payment\",null]",false)]
    [InlineData("[\"status\",\"payment\",\"delivery\",\"car\",\"warranty\",\"payment\"]",false)]
    public void ModelArrayMustRespectSchema(string array,bool valid)
    {
        var decision=BedrockAssistant.ParseDecision("{\"intents\":"+array+",\"orderReference\":\"current\",\"needsClarification\":false,\"clarificationKind\":null}");
        Assert.Equal(valid,decision!=null);
        if(valid) Assert.Equal(new[]{"payment","delivery"},decision!.Topics);
    }

    sealed class Client(string? output) : AmazonBedrockRuntimeClient(new AnonymousAWSCredentials(),RegionEndpoint.USEast1)
    {
        public override Task<ConverseResponse> ConverseAsync(ConverseRequest request,CancellationToken ct=default)
            => output == null ? throw new AmazonClientException("test unavailable") : Task.FromResult(new ConverseResponse {
                Output=new ConverseOutput {Message=new Message {Role=ConversationRole.Assistant,Content=[new ContentBlock {Text=output}]}}
            });
    }

    [Theory]
    [InlineData(null)]
    [InlineData("invalid JSON")]
    public async Task InvalidOrUnavailableProviderKeepsAllLocalTopics(string? output)
    {
        using var client=new Client(output);
        var service=new BedrockAssistant(client,new(){Enabled=true},NullLogger<BedrockAssistant>.Instance);
        var result=await service.ResolveContext("Trạng thái, còn phải trả bao nhiêu và khi nào nhận xe?",new(){CurrentOrderId=Guid.NewGuid()},[],default);
        Assert.Equal(new[]{"status","payment","delivery"},result.Topics);
    }
}
