from app.repositories.car_repository import CarRepository

class PostgresChatCatalogue:
    def __init__(self, conn):
        self.conn = conn

    async def find_mentioned(self, question: str):
        return await CarRepository.find_mentioned(self.conn, question, limit=5)

    async def search(self, question: str):
        return await CarRepository.search(self.conn, query=question, limit=5)
