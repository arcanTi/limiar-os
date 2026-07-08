"""Limiar OS — entry point. The server lives in the `backend` package; this thin
launcher keeps the run story (`python3 server.py`) unchanged."""

from backend.app import main

if __name__ == "__main__":
    main()
