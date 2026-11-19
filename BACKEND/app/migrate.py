# backend/app/migrate.py
from sqlalchemy import inspect, text
from sqlalchemy.engine import Engine


def ensure_column(engine: Engine, table: str, column: str, sql_type: str) -> None:
    """Adds a column to an existing table if it is missing (create_all never does this)."""
    existing = [c["name"] for c in inspect(engine).get_columns(table)]
    if column in existing:
        return
    with engine.begin() as connection:
        connection.execute(text(f"ALTER TABLE {table} ADD COLUMN {column} {sql_type}"))
    print(f"[db] added column {table}.{column}")