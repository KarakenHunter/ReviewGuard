from pydantic import BaseModel, field_validator


class AnalyzeRequest(BaseModel):
    review_text: str

    @field_validator("review_text")
    @classmethod
    def not_blank(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("review_text must not be empty")
        return v


class BatchItem(AnalyzeRequest):
    id: str | None = None


class BatchRequest(BaseModel):
    reviews: list[BatchItem]
