import logging
from typing import Any, Dict, List, Optional

from django.conf import settings

try:
    from google import genai
    from google.genai import types as genai_types
    GENAI_AVAILABLE = True
except ImportError:
    GENAI_AVAILABLE = False

logger = logging.getLogger(__name__)


class TacticalAnalyst:
    def __init__(self):
        try:
            if not GENAI_AVAILABLE:
                raise ImportError("google-genai package not installed")
            api_key = getattr(settings, "GEMINI_API_KEY", "")
            if not api_key:
                raise ValueError("GEMINI_API_KEY not configured")
            self.client = genai.Client(api_key=api_key)
            self.model_id = getattr(settings, "GEMINI_MODEL", "gemini-1.5-flash")
            self.is_ready = True
        except Exception as e:
            logger.warning(f"Failed to setup AI: {e}")
            self.is_ready = False

    def generate_insight(
        self,
        events: List[Dict[str, Any]],
        query: Optional[str] = None,
    ) -> str:
        if not self.is_ready:
            return "AI offline."

        if not events and not query:
            return "Not enough data."

        formatted_events = []
        for e in events:
            time_h_m = e.get("timestamp", "?")
            action = e.get("event_type", "Action")
            team = e.get("team", "Unknown")
            player = e.get("player", "Unknown")
            formatted_events.append(
                f"- Min {time_h_m}: {team} ({player}) performed {action}"
            )

        events_text = (
            "\n".join(formatted_events) if formatted_events else "No events available."
        )

        if query:
            prompt = (
                f"You are a sports match commentator and tactical analyst. A user is chatting with you about this match.\n"
                f"Here are the most recent events (if any):\n{events_text}\n\n"
                f'The user asks: "{query}"\n\n'
                f"Answer concisely in an analytical tone. Keep the response under 100 words. Focus strictly on sports."
            )
        else:
            prompt = (
                f"You are a sports analyst. Look at the last sequence of events:\n"
                f"{events_text}\n\n"
                f"Provide a short 50-word insight on momentum or possession, like a commentator pointing out a trend."
            )

        try:
            response = self.client.models.generate_content(
                model=self.model_id,
                contents=prompt,
            )
            if response and response.text:
                return response.text.strip()
            return "Synthesizing…"
        except Exception as e:
            logger.error(f"Error calling AI: {e}")
            return "Interference — AI engine unreachable."
