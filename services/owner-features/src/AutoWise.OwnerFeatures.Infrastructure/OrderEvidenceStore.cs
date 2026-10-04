using AutoWise.OwnerFeatures.Application;
using AutoWise.OwnerFeatures.Domain;
using Microsoft.EntityFrameworkCore;
namespace AutoWise.OwnerFeatures.Infrastructure;

public sealed class DocumentRecord
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid OrderId { get; set; }
    public string Name { get; set; } = "";
    public bool Required { get; set; }
    public string Status { get; set; } = "missing";
    public string? CustomerNote { get; set; }
    public DateTimeOffset UpdatedAt { get; set; } = DateTimeOffset.UtcNow;
    public Guid UpdatedBy { get; set; }
    public long Version { get; set; } = 1;
}
public sealed class OrderEvidenceStore(OrdersDb db, JourneyTransactions tx)
{
    async Task<Order> Owned(Guid id,Guid? user,CancellationToken ct) => OrderStore.Read(await db.Orders.AsNoTracking().SingleOrDefaultAsync(x=>x.Id==id&&(user==null||x.CustomerId==user),ct)??throw new KeyNotFoundException());
    public async Task<PaymentDetails> Payments(Guid id,Guid? user,int page,int size,string? reference,DateOnly? date,CancellationToken ct)
        => OrderEvidence.Payments(await Owned(id,user,ct),page,size,reference,date);
    public async Task<PaymentRow> Payment(Guid id,Guid paymentId,Guid? user,CancellationToken ct)
    {
        var order=await Owned(id,user,ct);
        var p=order.Payments.SingleOrDefault(x=>x.Id==paymentId)??throw new KeyNotFoundException();
        return new(p.Id,p.Reference,p.Type,p.AmountVnd,p.Status,p.CreatedAt,p.ConfirmedAt,p.FailureReason,p.OriginalReceiptId);
    }
    public async Task<DocumentDetails> Documents(Guid id,Guid? user,int page,int size,CancellationToken ct)
    {
        OrderEvidence.Paging(page,size); await Owned(id,user,ct);
        var query=db.Documents.AsNoTracking().Where(x=>x.OrderId==id);
        var items=await query.OrderByDescending(x=>x.Required).ThenBy(x=>x.Name).ThenBy(x=>x.Id).Skip((page-1)*size).Take(size)
            .Select(x=>new DocumentItem(x.Id,x.Name,x.Required,x.Status,x.CustomerNote,x.UpdatedAt,x.Version)).ToListAsync(ct);
        return new(id,new(items,page,size,await query.CountAsync(ct)),await query.CountAsync(x=>x.Required&&x.Status!="valid",ct),DateTimeOffset.UtcNow);
    }
    public Task<DocumentItem> Save(Guid orderId,Guid itemId,Guid actor,DocumentInput input,string key,CancellationToken ct)
        => tx.Run<DocumentItem>(actor,key,"documents:save:"+orderId+":"+itemId,input,async()=>
        {
            if(itemId==Guid.Empty) throw new BusinessRuleException("Cần ID mục hồ sơ hợp lệ.");
            var orderRow=await db.Orders.FromSqlInterpolated($"SELECT * FROM orders_service.orders WHERE \"Id\"={orderId} FOR UPDATE").SingleOrDefaultAsync(ct)??throw new KeyNotFoundException();
            var name=CustomerRules.Text(input.Name,150);
            if(input.Status is not ("missing" or "pending" or "valid" or "needs_changes")||input.CustomerNote?.Length>500)
                throw new BusinessRuleException("Trạng thái hoặc ghi chú hồ sơ không hợp lệ.");
            if(input.Status=="needs_changes"&&string.IsNullOrWhiteSpace(input.CustomerNote)) throw new BusinessRuleException("Cần ghi rõ nội dung khách phải bổ sung.");
            var row=await db.Documents.SingleOrDefaultAsync(x=>x.Id==itemId,ct);
            var notify=input.Status=="needs_changes" && (row==null || row.Status!=input.Status || row.CustomerNote!=input.CustomerNote?.Trim() || row.Name!=name);
            if(row==null) {
                if(input.Version!=0) throw new VersionConflictException();
                if(await db.Documents.CountAsync(x=>x.OrderId==orderId,ct)>=100) throw new BusinessRuleException("Tối đa 100 mục hồ sơ mỗi đơn.");
                row=new(){Id=itemId,OrderId=orderId}; db.Documents.Add(row);
            } else { if(row.OrderId!=orderId) throw new KeyNotFoundException(); CustomerRules.Version(row.Version,input.Version); row.Version++; }
            row.Name=name;row.Required=input.Required;row.Status=input.Status;row.CustomerNote=string.IsNullOrWhiteSpace(input.CustomerNote)?null:input.CustomerNote.Trim();row.UpdatedAt=DateTimeOffset.UtcNow;row.UpdatedBy=actor;
            if(notify) tx.Notify(orderRow.CustomerId,"document:"+row.Id+":"+row.Version,"Hồ sơ "+row.Name+" cần bổ sung","/account/orders/"+orderId,"document_needs_changes",orderId);
            return new(row.Id,row.Name,row.Required,row.Status,row.CustomerNote,row.UpdatedAt,row.Version);
        },ct);
    public static string Describe(DocumentDetails d) => d.Checklist.TotalCount==0?"Đại lý chưa cấu hình checklist hồ sơ cho đơn này; chưa có dữ liệu để xác định giấy tờ thiếu.":
        $"Có {d.RequiredOutstanding} giấy tờ bắt buộc chưa hợp lệ (tính toàn bộ checklist).\n"+string.Join("\n",d.Checklist.Items.Select(x=>$"{x.Name} · {(x.Required?"Bắt buộc":"Tùy chọn")} · "+
            (x.Status switch {"missing"=>"Chưa nộp","pending"=>"Chờ kiểm tra","valid"=>"Hợp lệ",_=>"Cần bổ sung"})+(x.CustomerNote==null?"":" · "+x.CustomerNote)));
}
