import asyncpg
from fastapi import APIRouter, Depends
from app.application.chat import ask_assistant
from app.core.database import get_db_connection
from app.models.schemas import ChatRequest, ChatResponse
from app.repositories.chat_catalogue import PostgresChatCatalogue

router = APIRouter(prefix="/chat", tags=["Chat"])

@router.post("", response_model=ChatResponse)
async def chat(request: ChatRequest, conn: asyncpg.Connection = Depends(get_db_connection)):
    return await ask_assistant(request, PostgresChatCatalogue(conn))
