FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
WORKDIR /src
COPY services/owner-features/ .
RUN dotnet publish src/AutoWise.OwnerFeatures.Api -c Release -o /out
FROM mcr.microsoft.com/dotnet/aspnet:10.0
WORKDIR /app
COPY --from=build /out .
ENV ASPNETCORE_URLS=http://+:8080
EXPOSE 8080
ENTRYPOINT ["dotnet", "AutoWise.OwnerFeatures.Api.dll"]
