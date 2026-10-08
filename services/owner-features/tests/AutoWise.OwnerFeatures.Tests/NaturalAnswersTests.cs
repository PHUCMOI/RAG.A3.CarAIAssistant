using System.Net;
using System.Text;
using System.Text.Json;
using AutoWise.OwnerFeatures.Infrastructure;

public class NaturalAnswersTests
{
    sealed class Handler : HttpMessageHandler
    {
        public string? Body;
        public HttpStatusCode Status = HttpStatusCode.OK;
        protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken ct)
        {
            Assert.EndsWith("/api/chat/compose", request.RequestUri!.ToString());
            Body = await request.Content!.ReadAsStringAsync(ct);
            return new(Status) { Content = new StringContent("{\"answer\":\"Bạn muốn hỏi đơn nào?\"}", Encoding.UTF8, "application/json") };
        }
    }
    [Fact]
    public async Task SendsVerifiedResultToSharedBedrockStage()
    {
        var handler = new Handler();
        var service = new NaturalAnswers(new HttpClient(handler) { BaseAddress = new("http://catalogue/") });
        Assert.Equal("Bạn muốn hỏi đơn nào?", await service.Compose("bao giờ giao?", new { RetrievedAnswer = "Chưa chọn đơn", ActionExecuted = false }, default));
        using var data = JsonDocument.Parse(handler.Body!);
        Assert.Equal("bao giờ giao?", data.RootElement.GetProperty("question").GetString());
        Assert.False(data.RootElement.GetProperty("verifiedData").GetProperty("actionExecuted").GetBoolean());
    }
    [Fact]
    public async Task ProviderFailureDoesNotReturnATemplateAsSuccess()
    {
        var service = new NaturalAnswers(new HttpClient(new Handler { Status = HttpStatusCode.ServiceUnavailable }) { BaseAddress = new("http://catalogue/") });
        await Assert.ThrowsAsync<HttpRequestException>(() => service.Compose("giá?", new { RetrievedAnswer = "Dữ liệu" }, default));
    }
}
