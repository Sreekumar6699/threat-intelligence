import asyncio
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
import os

from .database import engine, Base, AsyncSessionLocal
from .models import User

from .routers import api_router
from .worker import start_scheduler, stop_scheduler

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Setup Database
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    
    # Create default admin user if no users exist
    async with AsyncSessionLocal() as session:
        result = await session.execute(select(User))
        first_user = result.scalars().first()
        if not first_user:
            admin = User(
                username="admin",
                hashed_password="no-auth-placeholder",
                must_change_password=False
            )
            session.add(admin)
            await session.commit()

    # Start APScheduler worker
    start_scheduler()
    yield
    # Shutdown APScheduler worker
    stop_scheduler()

app = FastAPI(title="Threat Intelligence Dashboard", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(api_router, prefix="/api")

# Serve React frontend
FRONTEND_DIST = os.path.join(os.path.dirname(__file__), "..", "frontend", "dist")
if os.path.exists(FRONTEND_DIST):
    app.mount("/", StaticFiles(directory=FRONTEND_DIST, html=True), name="frontend")
