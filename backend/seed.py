"""Seed the database with predefined users."""
import asyncio
import uuid

from database import init_db, async_session
from models.user import User


SEED_USERS = [
    {"id": "00000000-0000-0000-0000-000000000001", "name": "Beginner", "levels": {}},
    {"id": "00000000-0000-0000-0000-000000000002", "name": "Intermediate", "levels": {"es": 3, "de": 2}},
    {"id": "00000000-0000-0000-0000-000000000003", "name": "Advanced", "levels": {"es": 5, "it": 4, "ru": 3}},
]


async def seed():
    await init_db()
    async with async_session() as session:
        for u in SEED_USERS:
            existing = await session.get(User, u["id"])
            if not existing:
                session.add(User(id=u["id"], name=u["name"], levels=u["levels"]))
                print(f"Created user: {u['name']} (levels {u['levels']})")
            else:
                print(f"User already exists: {u['name']}")
        await session.commit()
    print("Seeding complete.")


if __name__ == "__main__":
    asyncio.run(seed())
