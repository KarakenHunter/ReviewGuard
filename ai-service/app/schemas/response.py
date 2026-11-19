from typing import Any
from pydantic import BaseModel


class Labelled(BaseModel):
    label: str
    confidence: float
    scores: dict[str, float] = {}


class AnalyzeResponse(BaseModel):
    success: bool = True
    sentiment: Labelled
    emotion: Labelled
    linguistic_analysis: dict[str, Any]
    emotional_intensity: float
    risk_score: float
    risk_level: str
    recommendation: str
    recommendation_rationale: str
    automatic_action: str
    explanation: list[str]
    scoring: dict[str, Any]
    model_information: dict[str, Any]
    cached: bool = False
