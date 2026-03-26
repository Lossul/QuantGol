import logging
import re
from typing import Any, Dict, List, Optional

from django.conf import settings

try:
    from google import genai
    GENAI_AVAILABLE = True
except ImportError:
    GENAI_AVAILABLE = False

try:
    from groq import Groq
    from groq import APIStatusError as GroqAPIStatusError
    GROQ_AVAILABLE = True
except ImportError:
    GROQ_AVAILABLE = False

logger = logging.getLogger(__name__)


class AIServiceError(Exception):
    def __init__(self, message: str, *, code: str = "AI_ERROR", retry_after_seconds: Optional[int] = None):
        super().__init__(message)
        self.code = code
        self.retry_after_seconds = retry_after_seconds


def _extract_retry_seconds(error_text: str) -> Optional[int]:
    patterns = [
        r"retry in\s+([0-9]+(?:\.[0-9]+)?)s",
        r"retryDelay['\"]?\s*:\s*['\"]([0-9]+)s['\"]",
    ]
    for pattern in patterns:
        match = re.search(pattern, error_text, flags=re.IGNORECASE)
        if match:
            value = match.group(1)
            try:
                return int(float(value))
            except ValueError:
                return None
    return None


class TacticalAnalyst:
    def __init__(self):
        self.default_provider = getattr(settings, "AI_PROVIDER", "groq").strip().lower()
        raw_order = getattr(settings, "AI_PROVIDER_ORDER", "groq,gemini")
        self.provider_order = self._build_provider_order(raw_order)

        self.groq_client = None
        self.groq_model = getattr(settings, "GROQ_MODEL", "llama-3.1-8b-instant")
        self.groq_api_key = getattr(settings, "GROQ_API_KEY", "").strip()

        self.gemini_client = None
        self.gemini_model = getattr(settings, "GEMINI_MODEL", "gemini-1.5-flash")
        self.gemini_api_key = getattr(settings, "GEMINI_API_KEY", "").strip()

        self.ready_providers: Dict[str, bool] = {}

        self._setup_groq()
        self._setup_gemini()

        self.is_ready = any(self.ready_providers.get(provider, False) for provider in self.provider_order)

    def _build_provider_order(self, raw_order: str) -> List[str]:
        candidates = [item.strip().lower() for item in str(raw_order).split(",") if item.strip()]
        if self.default_provider and self.default_provider not in candidates:
            candidates.insert(0, self.default_provider)

        valid = []
        for item in candidates:
            if item in {"groq", "gemini"} and item not in valid:
                valid.append(item)

        if not valid:
            return ["groq", "gemini"]
        return valid

    def _setup_groq(self):
        if "groq" not in self.provider_order:
            self.ready_providers["groq"] = False
            return
        try:
            if not GROQ_AVAILABLE:
                raise ImportError("groq package not installed")
            if not self.groq_api_key:
                raise ValueError("GROQ_API_KEY not configured")
            self.groq_client = Groq(api_key=self.groq_api_key)
            self.ready_providers["groq"] = True
        except Exception as e:
            logger.warning(f"Groq setup skipped: {e}")
            self.ready_providers["groq"] = False

    def _setup_gemini(self):
        if "gemini" not in self.provider_order:
            self.ready_providers["gemini"] = False
            return
        try:
            if not GENAI_AVAILABLE:
                raise ImportError("google-genai package not installed")
            if not self.gemini_api_key:
                raise ValueError("GEMINI_API_KEY not configured")
            self.gemini_client = genai.Client(api_key=self.gemini_api_key)
            self.ready_providers["gemini"] = True
        except Exception as e:
            logger.warning(f"Gemini setup skipped: {e}")
            self.ready_providers["gemini"] = False

    def generate_insight(
        self,
        events: List[Dict[str, Any]],
        query: Optional[str] = None,
    ) -> str:
        if not self.is_ready:
            raise AIServiceError(
                "Interactive Analyst is offline. Configure at least one AI provider (Groq or Gemini).",
                code="AI_OFFLINE",
            )

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

        collected_errors: List[AIServiceError] = []
        attempted: List[str] = []

        for provider in self.provider_order:
            if not self.ready_providers.get(provider, False):
                continue

            attempted.append(provider)
            try:
                if provider == "groq":
                    return self._generate_with_groq(prompt)
                if provider == "gemini":
                    return self._generate_with_gemini(prompt)
            except AIServiceError as provider_error:
                collected_errors.append(provider_error)
                continue

        if not attempted:
            raise AIServiceError(
                "No configured AI providers are ready.",
                code="AI_OFFLINE",
            )

        last_error = collected_errors[-1] if collected_errors else AIServiceError(
            "All configured AI providers failed.",
            code="AI_UNREACHABLE",
        )
        retry_after = max(
            [e.retry_after_seconds for e in collected_errors if e.retry_after_seconds is not None],
            default=None,
        )
        attempted_text = ", ".join(attempted)
        raise AIServiceError(
            f"All AI providers failed ({attempted_text}). Last error: {str(last_error)}",
            code="AI_FAILOVER_EXHAUSTED",
            retry_after_seconds=retry_after,
        )

    def _generate_with_groq(self, prompt: str) -> str:
        try:
            completion = self.groq_client.chat.completions.create(
                model=self.groq_model,
                messages=[
                    {
                        "role": "system",
                        "content": "You are a football tactical analyst. Be concise and practical.",
                    },
                    {"role": "user", "content": prompt},
                ],
                temperature=0.4,
                max_tokens=180,
            )

            if not completion.choices:
                return "Synthesizing..."

            content = completion.choices[0].message.content
            if isinstance(content, str) and content.strip():
                return content.strip()
            return "Synthesizing..."

        except GroqAPIStatusError as e:
            error_text = str(e)
            logger.error(f"Error calling Groq: {error_text}")

            status_code = getattr(e, "status_code", None)
            if status_code == 429:
                retry_after = _extract_retry_seconds(error_text)
                wait_hint = f" Please retry in about {retry_after}s." if retry_after else " Please retry in a minute."
                raise AIServiceError(
                    f"Groq free-tier rate limit reached.{wait_hint}",
                    code="AI_QUOTA_EXCEEDED",
                    retry_after_seconds=retry_after,
                )

            if status_code == 403 and ("1010" in error_text or "cloudflare" in error_text.lower()):
                raise AIServiceError(
                    "Groq request blocked by edge security (Cloudflare 1010). Disable VPN/proxy and retry.",
                    code="AI_EDGE_BLOCKED",
                )

            if status_code in {401, 403}:
                raise AIServiceError(
                    "Groq authentication failed. Check GROQ_API_KEY.",
                    code="AI_AUTH_ERROR",
                )

            raise AIServiceError(
                "Interference - Groq engine unreachable right now. Please try again.",
                code="AI_UNREACHABLE",
            )

        except Exception as e:
            logger.error(f"Error calling Groq: {e}")
            raise AIServiceError(
                "Interference - Groq engine unreachable right now. Please try again.",
                code="AI_UNREACHABLE",
            )

    def _generate_with_gemini(self, prompt: str) -> str:
        try:
            response = self.gemini_client.models.generate_content(
                model=self.gemini_model,
                contents=prompt,
            )
            if response and response.text:
                return response.text.strip()
            return "Synthesizing..."
        except Exception as e:
            error_text = str(e)
            logger.error(f"Error calling Gemini: {error_text}")

            upper_text = error_text.upper()
            if "RESOURCE_EXHAUSTED" in upper_text or "QUOTA EXCEEDED" in upper_text or "429" in upper_text:
                retry_after = _extract_retry_seconds(error_text)
                wait_hint = f" Please retry in about {retry_after}s." if retry_after else " Please retry in a minute."
                raise AIServiceError(
                    f"Gemini quota limit reached.{wait_hint}",
                    code="AI_QUOTA_EXCEEDED",
                    retry_after_seconds=retry_after,
                )

            raise AIServiceError(
                "Interference - Gemini engine unreachable right now. Please try again.",
                code="AI_UNREACHABLE",
            )

    def generate_fallback_insight(
        self,
        events: List[Dict[str, Any]],
        query: Optional[str] = None,
    ) -> str:
        """Deterministic fallback insight used when external AI is unavailable."""
        if not events:
            return (
                "Fallback analyst: no event stream yet. Once events arrive, I will summarize momentum, "
                "shot pressure, and defensive actions automatically."
            )

        window = events[-20:]
        team_counts: Dict[str, int] = {}
        shots: Dict[str, int] = {}
        goals: Dict[str, int] = {}
        fouls: Dict[str, int] = {}
        team_possession_sum: Dict[str, float] = {}
        team_possession_count: Dict[str, int] = {}

        for event in window:
            team = str(event.get("team", "Unknown"))
            event_type = str(event.get("event_type", "Action"))
            team_counts[team] = team_counts.get(team, 0) + 1

            if event_type in {"Shot", "Goal"}:
                shots[team] = shots.get(team, 0) + 1
            if event_type == "Goal":
                goals[team] = goals.get(team, 0) + 1
            if event_type == "Foul":
                fouls[team] = fouls.get(team, 0) + 1

            possession_raw = event.get("possession_stat")
            if isinstance(possession_raw, (int, float)):
                team_possession_sum[team] = team_possession_sum.get(team, 0.0) + float(possession_raw)
                team_possession_count[team] = team_possession_count.get(team, 0) + 1

        top_team = max(team_counts, key=team_counts.get)
        top_team_events = team_counts.get(top_team, 0)
        top_team_shots = shots.get(top_team, 0)
        top_team_goals = goals.get(top_team, 0)
        top_team_fouls = fouls.get(top_team, 0)

        poss_avg = None
        if team_possession_count.get(top_team):
            poss_avg = round(team_possession_sum[top_team] / team_possession_count[top_team], 1)

        if query:
            if poss_avg is not None:
                return (
                    f"Fallback analyst: {top_team} controls the latest phase with {top_team_events} of the "
                    f"last {len(window)} actions, {top_team_shots} shots, {top_team_goals} goals, and "
                    f"~{poss_avg}% possession in those actions."
                )
            return (
                f"Fallback analyst: {top_team} leads recent activity with {top_team_events} of the last "
                f"{len(window)} actions, {top_team_shots} shots, {top_team_goals} goals, and {top_team_fouls} fouls."
            )

        if poss_avg is not None:
            return (
                f"Fallback analyst: momentum favors {top_team} ({top_team_events}/{len(window)} recent actions), "
                f"with {top_team_shots} shots, {top_team_goals} goals, and ~{poss_avg}% phase possession."
            )
        return (
            f"Fallback analyst: momentum favors {top_team} ({top_team_events}/{len(window)} recent actions), "
            f"with {top_team_shots} shots, {top_team_goals} goals, and {top_team_fouls} fouls in the same span."
        )
