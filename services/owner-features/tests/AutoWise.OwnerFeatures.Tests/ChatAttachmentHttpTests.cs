using System.Net;
using System.Net.Http.Json;
using System.Text.Json;

public class ChatAttachmentHttpTests
{
    [ContextHttpFact]
    public async Task LiveImageTurnStoresOwnedPrivateAttachmentAndReplays()
    {
        await using var owner = await HttpCustomerFixture.Create();
        await using var other = await HttpCustomerFixture.Create();
        HttpClient Client() => new(new HttpClientHandler { CookieContainer = new() }) { BaseAddress = new("http://localhost:5173/api/orders-service/"), Timeout = TimeSpan.FromSeconds(240) };
        using var client = Client(); using var foreign = Client(); using var anonymous = Client();
        async Task<JsonElement> Post(HttpClient http, string path, object body) {
            var csrf = await http.GetFromJsonAsync<JsonElement>("auth/csrf");
            using var request = new HttpRequestMessage(HttpMethod.Post, path) { Content = JsonContent.Create(body) };
            request.Headers.Add("X-CSRF-TOKEN", csrf.GetProperty("token").GetString());
            using var response = await http.SendAsync(request); response.EnsureSuccessStatusCode();
            return (await response.Content.ReadFromJsonAsync<JsonElement>()).Clone();
        }
        await Post(client, "auth/login", new { email = owner.User.Email, password = "DemoCustomer!2026" });
        await Post(foreign, "auth/login", new { email = other.User.Email, password = "DemoCustomer!2026" });
        var session = await Post(client, "assistant/sessions", new { id = Guid.NewGuid() });
        var root = Directory.GetCurrentDirectory();
        while (!File.Exists(Path.Combine(root, "docker-compose.yml"))) root = Directory.GetParent(root)!.FullName;
        var bytes = await File.ReadAllBytesAsync(Path.Combine(root, "image_service/tests/test_car.jpg"));
        var body = new { requestId = Guid.NewGuid(), version = session.GetProperty("version").GetInt64(), content = $"Xe trong ảnh có phải mẫu xe của đơn {owner.Codes[0]} không?", imageBase64 = Convert.ToBase64String(bytes), mimeType = "image/jpeg" };
        var path = $"assistant/sessions/{session.GetProperty("id").GetString()}/turns";
        var result = await Post(client, path, body);
        var messages = result.GetProperty("messages").EnumerateArray().ToArray();
        Assert.False(string.IsNullOrWhiteSpace(messages[^1].GetProperty("content").GetString()));
        Assert.Equal("bedrock-natural", messages[^1].GetProperty("generationMode").GetString());
        var url = messages[^2].GetProperty("imageUrl").GetString()!;
        Assert.DoesNotContain("base64", result.GetRawText());
        using var image = await client.GetAsync(new Uri(new Uri("http://localhost:5173"), url));
        Assert.Equal(HttpStatusCode.OK, image.StatusCode);
        Assert.Equal(bytes, await image.Content.ReadAsByteArrayAsync());
        Assert.True(image.Headers.CacheControl!.NoStore);
        using var denied = await foreign.GetAsync(new Uri(new Uri("http://localhost:5173"), url));
        Assert.Equal(HttpStatusCode.NotFound, denied.StatusCode);
        using var unauthenticated = await anonymous.GetAsync(new Uri(new Uri("http://localhost:5173"), url));
        Assert.Equal(HttpStatusCode.Unauthorized, unauthenticated.StatusCode);
        var replay = await Post(client, path, body);
        Assert.Equal(result.GetProperty("version").GetInt64(), replay.GetProperty("version").GetInt64());
        Assert.Equal(url, replay.GetProperty("messages").EnumerateArray().ToArray()[^2].GetProperty("imageUrl").GetString());
    }
}
