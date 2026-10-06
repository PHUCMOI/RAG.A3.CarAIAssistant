from app.repositories.car_repository import map_car_row
from tests.conftest import MOCK_CAR_ROW


def car(car_id="car_34_3", name="Honda CR-V", aliases=None, **changes):
    row = dict(MOCK_CAR_ROW, car_id=car_id, display_name=name,
               aliases=aliases if aliases is not None else ["CRV", "CR-V"], **changes)
    return map_car_row(row)
