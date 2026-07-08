"""Catalog routes: shop items and map locations."""

from http import HTTPStatus

from ..domain.validation import ValidationError, validate_item, validate_map_location
from ..repositories.records import list_records, upsert_record


class CatalogRoutes:
    """Routes for shop items and map locations."""

    def _get_items(self) -> None:
        self.write_json(list_records("items"))

    def _get_map(self) -> None:
        self.write_json(list_records("map"))

    def _post_items(self) -> None:
        try:
            payload = self.read_json()
            validate_item(payload)
        except ValidationError as e:
            return self.write_error(HTTPStatus.BAD_REQUEST, str(e), "VALIDATION_ERROR")
        return self.write_json(upsert_record("items", payload))

    def _post_map(self) -> None:
        try:
            payload = self.read_json()
            validate_map_location(payload)
        except ValidationError as e:
            return self.write_error(HTTPStatus.BAD_REQUEST, str(e), "VALIDATION_ERROR")
        return self.write_json(upsert_record("map", payload))
