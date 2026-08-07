"""Application queries for service metadata and static references."""

from .errors import ApplicationError
from .ports import MetadataRepository, Record


class MetadataService:
    """Read operational metadata and versioned reference documents."""
    def __init__(self, repository: MetadataRepository) -> None:
        self.repository = repository

    def health(self) -> Record:
        return self.repository.health()

    def reference(self, name: str) -> object:
        data = self.repository.reference(name)
        if data is None:
            raise ApplicationError(404, f"Reference '{name}' not found")
        return data
