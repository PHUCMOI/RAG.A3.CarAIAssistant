using System.Net;
using System.Net.Http.Json;
using System.Text.Json;

public class MultiIntentHttpTests
{
    [ContextHttpFact]
    public async Task RunningApiReturnsEveryTopicAndReplaysWithoutAnotherTurn()
    {
        await using var fixture=await HttpCustomerFixture.Create();
        using var client=new HttpClient(new HttpClientHandler {CookieContainer=new CookieContainer()}) {
            BaseAddress=new Uri("http://localhost:5173/api/orders-service/"),Timeout=TimeSpan.FromSeconds(60)
        };
        async Task<JsonElement> Post(string path,object body)
        {
            var csrf=await client.GetFromJsonAsync<JsonElement>("auth/csrf");
            using var request=new HttpRequestMessage(HttpMethod.Post,path){Content=JsonContent.Create(body)};
            request.Headers.Add("X-CSRF-TOKEN",csrf.GetProperty("token").GetString());
            using var response=await client.SendAsync(request);response.EnsureSuccessStatusCode();
            return (await response.Content.ReadFromJsonAsync<JsonElement>()).Clone();
        }
        await Post("auth/login",new {email=fixture.User.Email,password="DemoCustomer!2026"});
        var session=await Post("assistant/sessions",new {id=Guid.NewGuid()});
        var path=$"assistant/sessions/{session.GetProperty("id").GetString()}/messages";
        async Task<JsonElement> Send(string question)
        {
            session=await Post(path,new {requestId=Guid.NewGuid(),version=session.GetProperty("version").GetInt64(),content=question});
            return session.GetProperty("messages").EnumerateArray().Last();
        }
        string[] Topics(JsonElement message)=>message.GetProperty("sections").EnumerateArray().Select(s=>s.GetProperty("topic").GetString()!).ToArray();
        var reply=await Send("Trạng thái, còn phải trả bao nhiêu và khi nào nhận xe?");
        Assert.Equal(JsonValueKind.Null,reply.GetProperty("sections").ValueKind);
        reply=await Send(fixture.Codes[0]);
        Assert.Equal(new[]{"status","payment","delivery"},Topics(reply));
        Assert.Equal(fixture.Codes[0],reply.GetProperty("orderCode").GetString());
        Assert.All(reply.GetProperty("sections").EnumerateArray(),s=>Assert.Equal("success",s.GetProperty("resultStatus").GetString()));
        reply=await Send($"Còn đơn {fixture.Codes[1]} thì sao?");
        Assert.Equal(new[]{"status","payment","delivery"},Topics(reply));
        Assert.Equal(fixture.Codes[1],reply.GetProperty("orderCode").GetString());
        reply=await Send("Còn bảo hành thì sao?");
        Assert.Equal(new[]{"warranty"},Topics(reply));
        reply=await Send("Thanh toán bao nhiêu, còn nợ bao nhiêu?");
        Assert.Equal(new[]{"payment"},Topics(reply));
        var body=new {requestId=Guid.NewGuid(),version=session.GetProperty("version").GetInt64(),content="Thanh toán và lịch giao?"};
        session=await Post(path,body);
        var replay=await Post(path,body);
        Assert.Equal(session.GetProperty("version").GetInt64(),replay.GetProperty("version").GetInt64());
        Assert.Equal(session.GetProperty("messages").GetArrayLength(),replay.GetProperty("messages").GetArrayLength());
        Assert.Equal(new[]{"payment","delivery"},Topics(replay.GetProperty("messages").EnumerateArray().Last()));
        Console.WriteLine("PASS running multi-intent API: pending topics, switch, warranty, dedup, replay.");
    }
}
