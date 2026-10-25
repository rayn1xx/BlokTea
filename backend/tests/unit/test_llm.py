from collections.abc import Iterator

import httpx
import pytest
from pydantic import BaseModel, Field

from app.core.config import settings
from app.integrations.llm import LlmClient, generation_schema, numbers_in_text, unknown_numbers
from tests.fake_llm import FakeOllama


class Out(BaseModel):
    text: str


class Short(BaseModel):
    text: str = Field(max_length=10)
    items: list[str] = Field(max_length=2)


@pytest.fixture
def enabled(monkeypatch: pytest.MonkeyPatch) -> Iterator[None]:
    monkeypatch.setattr(settings, "llm_enabled", True)
    yield


def make_client(fake: FakeOllama) -> LlmClient:
    client = LlmClient()
    client.transport = fake.transport
    return client


class TestNumbers:
    def test_formats(self) -> None:
        assert numbers_in_text("1 500 000 ₽ на 36 мес, 1,5 млн, 26,2%") == [1_500_000, 36, 1_500_000, 26.2]

    def test_rounded_numbers_match_input(self) -> None:
        data = {"amount_rub": 1_500_000, "load_percent": 26.2, "term_months": 36}

        assert unknown_numbers(["1,5 млн на 36 мес, нагрузка 26%", "26,2% потока"], data) == []

    def test_invented_number_detected(self) -> None:
        assert unknown_numbers(["ставка 12% и 2 млн"], {"amount_rub": 1_500_000}) == [12, 2_000_000]

    def test_numbers_inside_input_strings_count(self) -> None:
        assert unknown_numbers(["Бизнесу 3 года"], {"facts": [{"value": "Бизнесу 3 года 2 мес"}]}) == []


class TestClient:
    async def test_disabled_without_request(self) -> None:
        fake = FakeOllama({"I4": lambda _: {"text": "x"}})

        result = await make_client(fake).complete("I4", {}, Out)

        assert (result.ok, result.reason, fake.calls) == (False, "disabled", [])

    async def test_valid_answer(self, enabled: None) -> None:
        fake = FakeOllama({"I4": lambda _: {"text": "Подходит для оборотных средств"}})

        result = await make_client(fake).complete("I4", {"a": 1}, Out)

        assert result.ok and result.output.text == "Подходит для оборотных средств"
        body = fake.calls[0]["body"]
        assert body["format"] == Out.model_json_schema()
        assert body["options"]["temperature"] == settings.llm_temperature
        assert body["stream"] is False

    @pytest.mark.parametrize(
        ("answer", "reason"),
        [("не json", "invalid_json"), ({"other": 1}, "schema_mismatch"), ({"text": "ставка 12%"}, "numbers_mismatch")],
    )
    async def test_bad_answers_retry_once_then_fail(self, enabled: None, answer, reason: str) -> None:
        fake = FakeOllama({"I5": lambda _: answer})

        result = await make_client(fake).complete("I5", {"amount_rub": 100}, Out, check_numbers=True)

        assert (result.ok, result.reason) == (False, reason)
        assert len(fake.calls) == 2

    async def test_timeout(self, enabled: None) -> None:
        def slow(request: httpx.Request) -> httpx.Response:
            raise httpx.ReadTimeout("slow", request=request)

        client = LlmClient()
        client.transport = httpx.MockTransport(slow)

        assert (await client.complete("I6", {}, Out)).reason == "timeout"

    async def test_cached_by_input(self, enabled: None) -> None:
        fake = FakeOllama({"I6": lambda _: {"text": "ok"}})
        client = make_client(fake)

        await client.complete("I6", {"a": 1}, Out)
        await client.complete("I6", {"a": 1}, Out)
        await client.complete("I6", {"a": 2}, Out)

        assert len(fake.calls) == 2


class TestLength:
    def test_grammar_has_no_length_limits(self) -> None:
        schema = generation_schema(Short.model_json_schema())

        assert "maxLength" not in schema["properties"]["text"]
        assert "maxItems" not in schema["properties"]["items"]

    async def test_too_long_answer_rejected_by_validation(self, enabled: None) -> None:
        fake = FakeOllama({"I6": lambda _: {"text": "очень длинный текст", "items": []}})

        result = await make_client(fake).complete("I6", {}, Short)

        assert result.reason == "schema_mismatch"


async def test_long_dash_replaced(enabled: None) -> None:
    fake = FakeOllama({"I7": lambda _: {"text": "Балл \u2014 72, срок 12\u201324 мес"}})

    result = await make_client(fake).complete("I7", {"score": 72, "terms": [12, 24]}, Out, check_numbers=True)

    assert result.output.text == "Балл - 72, срок 12-24 мес"
