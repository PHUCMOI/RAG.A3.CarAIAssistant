using AutoWise.OwnerFeatures.Application;

public class CatalogueReferencesTests
{
    static ChatMessage Answer(params CatalogContext[] cars) =>
        new("assistant", "Kết quả tra cứu", DateTimeOffset.UtcNow, Catalog: true, Contexts: cars.ToList());

    [Fact]
    public void BrandReferenceChoosesMazdaFromPreviousComparisonAndPreservesNewCar()
    {
        var question = "Hãy so sánh chiếc mazda bên trên với Toyota Camry cho tôi";
        var result = CatalogueReferences.Resolve(question, [Answer(new CatalogContext("honda", "Honda CR-V"), new CatalogContext("mazda", "Mazda CX-5"))]);
        Assert.Null(result.Clarification);
        Assert.Contains("Mazda CX-5", result.Question);
        Assert.Contains("Toyota Camry", result.Question);
    }

    [Fact]
    public void FindsEarlierBrandEvenAfterAnotherCarWasDiscussed()
    {
        var result = CatalogueReferences.Resolve("So sánh Mazda bên trên với Toyota Camry",
            [Answer(new CatalogContext("mazda", "Mazda CX-5")), Answer(new CatalogContext("honda", "Honda CR-V"))]);
        Assert.Null(result.Clarification);
        Assert.Contains("Mazda CX-5", result.Question);
    }

    [Fact]
    public void AmbiguousBrandAsksWhichModelInsteadOfTakingFirstCar()
    {
        var result = CatalogueReferences.Resolve("So sánh chiếc Mazda bên trên với Camry",
            [Answer(new CatalogContext("cx5", "Mazda CX-5"), new CatalogContext("mazda3", "Mazda 3"))]);
        Assert.NotNull(result.Clarification);
        Assert.Contains("Mazda CX-5", result.Clarification);
        Assert.Contains("Mazda 3", result.Clarification);
    }

    [Fact]
    public void GenericReferenceDoesNotPickFirstOfSeveralCars()
    {
        var result = CatalogueReferences.Resolve("Xe đó bảo hành thế nào?",
            [Answer(new CatalogContext("mazda", "Mazda CX-5"), new CatalogContext("honda", "Honda CR-V"))]);
        Assert.NotNull(result.Clarification);
    }

    [Fact]
    public void ImageContextWorksWithoutAnOrder()
    {
        var result = CatalogueReferences.Resolve("So sánh xe trong ảnh với Toyota Camry",
            [Answer(new CatalogContext("mazda", "Mazda CX-5")) with { Uncertain = true }]);
        Assert.Contains("Mazda CX-5", result.Question);
        Assert.Contains("chưa chắc chắn", result.Question);
        Assert.True(result.Uncertain);
    }

    [Theory]
    [InlineData("So sánh Mazda 3 với Toyota Camry")]
    [InlineData("Đơn AW-DEMO-0001 của tôi đến đâu rồi?")]
    public void ExplicitQuestionDoesNotInheritAnUnrelatedCar(string question)
    {
        var result = CatalogueReferences.Resolve(question, [Answer(new CatalogContext("mazda", "Mazda CX-5"))]);
        Assert.Equal(question, result.Question);
        Assert.Null(result.Clarification);
    }

    [Fact]
    public void MissingReferenceAsksForModelWithoutInventingCandidates()
    {
        var result = CatalogueReferences.Resolve("So sánh chiếc Mazda bên trên với Toyota Camry", []);
        Assert.NotNull(result.Clarification);
        Assert.DoesNotContain("CX-5", result.Clarification);
    }

    [Fact]
    public void MissingBrandDoesNotFallBackToAnotherBrand()
    {
        var result = CatalogueReferences.Resolve("So sánh chiếc Mazda bên trên với Toyota Camry",
            [Answer(new CatalogContext("honda", "Honda CR-V"))]);
        Assert.NotNull(result.Clarification);
        Assert.DoesNotContain("Honda CR-V", result.Question);
    }

    [Fact]
    public void ExplicitModelReferenceCanSelectWithinABrand()
    {
        var result = CatalogueReferences.Resolve("So sánh Mazda CX-5 bên trên với Toyota Camry",
            [Answer(new CatalogContext("cx5", "Mazda CX-5"), new CatalogContext("mazda3", "Mazda 3"))]);
        Assert.Null(result.Clarification);
        Assert.DoesNotContain("Mazda 3", result.Question);
    }
}

