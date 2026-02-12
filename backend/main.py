from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from database import init_db, async_session
from seed import seed
from routers import users, projects, transform, assessment, export, reader_chat, dictionary, comprehension
from services.transformer import recover_incomplete_jobs


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
    await seed(reset_users=False, prune_missing=False)
    await recover_incomplete_jobs(async_session)
    yield


app = FastAPI(title="Gradient Immersion", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(users.router)
app.include_router(projects.router)
app.include_router(transform.router)
app.include_router(assessment.router)
app.include_router(export.router)
app.include_router(reader_chat.router)
app.include_router(dictionary.router)
app.include_router(comprehension.router)


@app.get("/api/health")
async def health():
    return {"status": "ok"}
