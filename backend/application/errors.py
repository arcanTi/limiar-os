"""Errors raised by use cases and translated at the HTTP boundary."""

from http import HTTPStatus


class ApplicationError(Exception):
    """Expected use-case failure with a stable public error code."""

    def __init__(self, status: int, message: str, code: str | None = None) -> None:
        self.status = status
        self.message = message
        self.code = code or HTTPStatus(status).phrase.upper().replace(" ", "_")
        super().__init__(message)
