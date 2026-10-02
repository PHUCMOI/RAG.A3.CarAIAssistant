using System.Net.Http.Json;
using AutoWise.OwnerFeatures.Application;
using AutoWise.OwnerFeatures.Domain;
namespace AutoWise.OwnerFeatures.Infrastructure;

public sealed class CommonCatalogue(HttpClient http) : ICommonCatalogue
{
    public async Task<CarSnapshot> GetCar(string id, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(id) || id.Length > 150) throw new BusinessRuleException("Mã xe không hợp lệ.");
        var response = await http.GetAsync("api/cars/" + Uri.EscapeDataString(id), ct);
        if (response.StatusCode == System.Net.HttpStatusCode.NotFound) throw new BusinessRuleException("Xe không tồn tại trong catalogue.");
        response.EnsureSuccessStatusCode();
        return (await response.Content.ReadFromJsonAsync<CarSnapshot>(ct))!;
    }
    public async Task<DealerSnapshot> GetDealer(long id, CancellationToken ct)
    {
        var response = await http.GetFromJsonAsync<Dealers>("api/dealers", ct);
        return response!.Items.SingleOrDefault(d => d.DealerId == id) ?? throw new BusinessRuleException("Đại lý không tồn tại.");
    }
    public async Task<WarrantySnapshot?> GetWarranty(string carId,string brand,CancellationToken ct) {
        var result=await http.GetFromJsonAsync<WarrantyList>("api/warranties?car_id="+Uri.EscapeDataString(carId)+"&brand="+Uri.EscapeDataString(brand),ct);
        return result?.Items.FirstOrDefault();
    }
    private record WarrantyList(List<WarrantySnapshot> Items);
    private record Dealers(List<DealerSnapshot> Items);
}
