from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from routes.analysis import router as analysis_router
from dotenv import load_dotenv
import os

# Gunakan path absolut relatif terhadap lokasi file ini (backend/main.py)
# sehingga .env selalu ditemukan terlepas dari folder mana uvicorn dijalankan.
_BASE_DIR = os.path.dirname(os.path.abspath(__file__))
load_dotenv(os.path.join(_BASE_DIR, ".env"))

app = FastAPI(title="TradingAgents API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(analysis_router, prefix="/api")