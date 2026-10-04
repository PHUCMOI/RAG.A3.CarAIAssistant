using AutoWise.OwnerFeatures.Application;
using AutoWise.OwnerFeatures.Domain;
using Microsoft.EntityFrameworkCore;
namespace AutoWise.OwnerFeatures.Infrastructure;
public sealed class SupportTicketRecord
{
    public Guid Id {get;set;}=Guid.NewGuid();
    public string Code {get;set;}="";
    public Guid CustomerId {get;set;}
    public Guid SessionId {get;set;}
    public Guid? OrderId {get;set;}
    public Guid? PaymentId {get;set;}
    public Guid? ChangeRequestId {get;set;}
    public string Subject {get;set;}="";
    public string Summary {get;set;}="";
    public string Status {get;set;}="new";
    public Guid? AssignedTo {get;set;}
    public DateTimeOffset CreatedAt {get;set;}=DateTimeOffset.UtcNow;
    public DateTimeOffset UpdatedAt {get;set;}=DateTimeOffset.UtcNow;
    public long Version {get;set;}=1;
    public string Snapshot {get;set;}="[]";
}
public sealed class SupportReplyRecord
{
    public Guid Id {get;set;}=Guid.NewGuid(); public Guid TicketId {get;set;} public Guid AuthorId {get;set;}
    public string AuthorRole {get;set;}=""; public string Content {get;set;}=""; public bool Internal {get;set;} public DateTimeOffset At {get;set;}=DateTimeOffset.UtcNow;
}
public sealed class SupportAuditRecord
{
    public Guid Id {get;set;}=Guid.NewGuid(); public Guid TicketId {get;set;} public Guid ActorId {get;set;}
    public string Action {get;set;}=""; public long Version {get;set;} public DateTimeOffset At {get;set;}=DateTimeOffset.UtcNow;
}
public sealed class SupportStore(OrdersDb db,JourneyTransactions tx)
{
    public async Task ValidateLinks(Guid user,Guid? orderId,Guid? paymentId,Guid? changeId,CancellationToken ct)
    {
        Order? order=null;
        if(orderId!=null) order=OrderStore.Read(await db.Orders.AsNoTracking().SingleOrDefaultAsync(x=>x.Id==orderId&&x.CustomerId==user,ct)??throw new KeyNotFoundException());
        if(paymentId!=null&&(order==null||!order.Payments.Any(x=>x.Id==paymentId))) throw new KeyNotFoundException();
        if(changeId!=null&&!await db.Changes.AnyAsync(x=>x.Id==changeId&&x.CustomerId==user&&(orderId==null||x.OrderId==orderId),ct)) throw new KeyNotFoundException();
    }
    internal async Task<SupportTicketRecord> Create(Guid user,Guid sessionId,AssistantDraft draft,CancellationToken ct)
    {
        if(!await db.ChatSessions.AnyAsync(x=>x.Id==sessionId&&x.UserId==user,ct)) throw new KeyNotFoundException();
        await ValidateLinks(user,draft.OrderId==Guid.Empty?null:draft.OrderId,draft.PaymentId,draft.ChangeRequestId,ct);
        var row=new SupportTicketRecord{CustomerId=user,SessionId=sessionId,OrderId=draft.OrderId==Guid.Empty?null:draft.OrderId,PaymentId=draft.PaymentId,ChangeRequestId=draft.ChangeRequestId,
            Subject=CustomerRules.Text(SupportRules.Clean(draft.Subject),150),Summary=CustomerRules.Text(SupportRules.Clean(draft.Reason),800),Snapshot=JourneyTransactions.Pack(draft.Snapshot)};
        row.Code="ST-"+row.Id.ToString("N")[..12].ToUpperInvariant();db.SupportTickets.Add(row);
        db.SupportAudits.Add(new(){TicketId=row.Id,ActorId=user,Action="created",Version=1});return row;
    }
    public async Task<object> List(Guid? user,int page,int size,CancellationToken ct)
    {
        OrderEvidence.Paging(page,size);var query=db.SupportTickets.AsNoTracking().Where(x=>user==null||x.CustomerId==user);
        var items=await query.OrderByDescending(x=>x.UpdatedAt).ThenBy(x=>x.Id).Skip((page-1)*size).Take(size).Select(x=>new{x.Id,x.Code,x.Subject,x.Status,x.UpdatedAt,x.Version}).ToListAsync(ct);
        return new {items,pageNumber=page,pageSize=size,totalCount=await query.CountAsync(ct)};
    }
    public async Task<TicketView> Get(Guid id,Guid? user,int page,int size,CancellationToken ct)
    {
        OrderEvidence.Paging(page,size);var row=await db.SupportTickets.AsNoTracking().SingleOrDefaultAsync(x=>x.Id==id&&(user==null||x.CustomerId==user),ct)??throw new KeyNotFoundException();
        var query=db.SupportReplies.AsNoTracking().Where(x=>x.TicketId==id&&(user==null||!x.Internal));
        var replies=await query.OrderBy(x=>x.At).ThenBy(x=>x.Id).Skip((page-1)*size).Take(size).Select(x=>new TicketReplyView(x.Id,x.AuthorRole,x.Content,x.At,x.Internal)).ToListAsync(ct);
        return new(row.Id,row.Code,row.Subject,row.Summary,row.Status,row.Version,row.OrderId,row.PaymentId,row.ChangeRequestId,row.AssignedTo,row.CreatedAt,row.UpdatedAt,JourneyTransactions.Unpack<List<SupportExchange>>(row.Snapshot),new(replies,page,size,await query.CountAsync(ct)));
    }
    public Task<TicketView> Reply(Guid id,Guid actor,bool admin,TicketReplyInput input,string key,CancellationToken ct)=>tx.Run(actor,key,"support:reply:"+id,input,async()=>
    {
        var row=await Locked(id,actor,admin,input.Version,ct);
        if(input.Internal&&!admin) throw new BusinessRuleException("Khách chỉ gửi phản hồi công khai.");
        if(await db.SupportReplies.CountAsync(x=>x.TicketId==id,ct)>=200) throw new BusinessRuleException("Phiếu đạt giới hạn 200 phản hồi.");
        row.Status=SupportRules.Transition(row.Status,"reply",admin);
        db.SupportReplies.Add(new(){TicketId=id,AuthorId=actor,AuthorRole=admin?"Admin":"Customer",Content=CustomerRules.Text(SupportRules.Clean(input.Content),1000),Internal=input.Internal});
        Advance(row,actor,input.Internal?"internal_reply":"reply");
        if(admin && !input.Internal) tx.Notify(row.CustomerId,"support:"+id+":"+row.Version,row.Code+": nhân viên đã phản hồi","/account/support-tickets/"+id,"support_reply",row.OrderId);
        await db.SaveChangesAsync(ct);return await Get(id,admin?null:actor,1,20,ct);
    },ct);
    public Task<TicketView> Act(Guid id,Guid actor,TicketActionInput input,string key,CancellationToken ct)=>tx.Run(actor,key,"support:action:"+id,input,async()=>
    {
        var row=await Locked(id,actor,true,input.Version,ct);row.Status=SupportRules.Transition(row.Status,input.Action,true);
        if(input.Action=="accept") row.AssignedTo=actor;Advance(row,actor,input.Action);await db.SaveChangesAsync(ct);return await Get(id,null,1,20,ct);
    },ct);
    async Task<SupportTicketRecord> Locked(Guid id,Guid actor,bool admin,long version,CancellationToken ct)
    {
        var row=await db.SupportTickets.FromSqlInterpolated($"SELECT * FROM orders_service.support_tickets WHERE \"Id\"={id} FOR UPDATE").SingleOrDefaultAsync(x=>admin||x.CustomerId==actor,ct)??throw new KeyNotFoundException();
        CustomerRules.Version(row.Version,version);return row;
    }
    void Advance(SupportTicketRecord row,Guid actor,string action) {row.Version++;row.UpdatedAt=DateTimeOffset.UtcNow;db.SupportAudits.Add(new(){TicketId=row.Id,ActorId=actor,Action=action,Version=row.Version});}
}
