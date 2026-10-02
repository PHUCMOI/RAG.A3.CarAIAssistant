from collections.abc import Awaitable, Callable

from app.models.schemas import CarDto, CarComparisonResponse


class InvalidComparison(ValueError):
    """The selection does not satisfy comparison rules."""


async def compare_cars(
    ids: list[str], get_car: Callable[[str], Awaitable[CarDto | None]],
) -> CarComparisonResponse:
    if not 2 <= len(ids) <= 3 or any(not car_id for car_id in ids) or len(set(ids)) != len(ids):
        raise InvalidComparison("Select two or three distinct, non-empty car IDs")
    items, missing = [], []
    for car_id in ids:
        car = await get_car(car_id)
        if car is None:
            missing.append(car_id)
        else:
            items.append(car)
    return CarComparisonResponse(items=items, missingIds=missing)
