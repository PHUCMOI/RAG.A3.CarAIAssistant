using System.Net;
using System.Net.Http.Json;
using System.Text.Json;

public sealed class ContextHttpFactAttribute : FactAttribute
{
    public ContextHttpFactAttribute() {if(Environment.GetEnvironmentVariable("CONTEXT_HTTP_SMOKE")!="true") Skip="Opt-in running local Docker + Bedrock API smoke.";}
}

public class ContextHttpSmokeTests
{
    [ContextHttpFact]
    public async Task CustomerDialogueAndSessionIsolationOverHttp()
    {
        using var client=new HttpClient(new HttpClientHandler {CookieContainer=new CookieContainer()})
        {BaseAddress=new Uri("http://localhost:5173/api/orders-service/"),Timeout=TimeSpan.FromSeconds(60)};
        async Task<JsonElement> Post(string path,object body)
        {
            var csrf=await client.GetFromJsonAsync<JsonElement>("auth/csrf");
            using var request=new HttpRequestMessage(HttpMethod.Post,path){Content=JsonContent.Create(body)};
            request.Headers.Add("X-CSRF-TOKEN",csrf.GetProperty("token").GetString());
            using var response=await client.SendAsync(request);response.EnsureSuccessStatusCode();
            return (await response.Content.ReadFromJsonAsync<JsonElement>()).Clone();
        }
        await Post("auth/login",new {email="customer1@autowise.test",password="DemoCustomer!2026"});
        var session=await Post("assistant/sessions",new{id=Guid.NewGuid()});
        var id=session.GetProperty("id").GetString();
        var path=$"assistant/sessions/{id}/messages";
        async Task<JsonElement> Send(string question)
        {
            session=await Post(path,new {requestId=Guid.NewGuid(),version=session.GetProperty("version").GetInt64(),content=question});
            return session.GetProperty("messages").EnumerateArray().Last();
        }
        foreach(var item in new[]{
            ("Đơn AW-DEMO-0001 đang đến đâu?","GetMyOrderStatus","AW-DEMO-0001"),
            ("Còn phải trả bao nhiêu?","GetMyOrderPaymentSummary","AW-DEMO-0001"),
            ("Khi nào nhận xe?","GetMyDeliverySchedule","AW-DEMO-0001"),
            ("Còn đơn AW-DEMO-0007 thì sao?","GetMyDeliverySchedule","AW-DEMO-0007"),
            ("Đơn trước còn nợ bao nhiêu?","GetMyOrderPaymentSummary","AW-DEMO-0001")})
        {
            var reply=await Send(item.Item1);
            Assert.Equal(item.Item2,reply.GetProperty("tool").GetString());Assert.Equal(item.Item3,reply.GetProperty("orderCode").GetString());
        }
        var selected=session.GetProperty("selectedOrderId").GetString();
        Assert.Equal("NavigateAccount",(await Send("Mở trang đổi mật khẩu")).GetProperty("tool").GetString());
        Assert.Equal(selected,session.GetProperty("selectedOrderId").GetString());
        var reopened=await client.GetFromJsonAsync<JsonElement>($"assistant/sessions/{id}");
        Assert.Equal(session.GetProperty("version").GetInt64(),reopened.GetProperty("version").GetInt64());
        var fresh=await Post("assistant/sessions",new{id=Guid.NewGuid()});
        Assert.Equal(JsonValueKind.Null,fresh.GetProperty("selectedOrderId").ValueKind);
        Assert.Empty(fresh.GetProperty("messages").EnumerateArray());
        // Missing CSRF is rejected before invoking the model.
        using var missingCsrf=await client.PostAsJsonAsync(path,new {requestId=Guid.NewGuid(),version=session.GetProperty("version").GetInt64(),content="test"});
        Assert.Equal(HttpStatusCode.BadRequest,missingCsrf.StatusCode);
        // Logout clears authentication; old session cannot be accessed afterward.
        var token=await client.GetFromJsonAsync<JsonElement>("auth/csrf");
        using var logout=new HttpRequestMessage(HttpMethod.Post,"auth/logout");logout.Headers.Add("X-CSRF-TOKEN",token.GetProperty("token").GetString());
        using var loggedOut=await client.SendAsync(logout);loggedOut.EnsureSuccessStatusCode();
        using var denied=await client.GetAsync($"assistant/sessions/{id}");Assert.Equal(HttpStatusCode.Unauthorized,denied.StatusCode);
    }
}
