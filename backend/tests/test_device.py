import pytest

from lerobot_lens.services.device import choose_device


@pytest.mark.parametrize(
    ("requested", "cuda", "mps", "expected"),
    [
        ("cpu", True, True, "cpu"),
        ("cuda", True, False, "cuda"),
        ("mps", False, True, "mps"),
        ("auto", True, True, "cuda"),
        ("auto", False, True, "mps"),
        ("auto", False, False, "cpu"),
        ("cuda", False, True, "mps"),
        ("mps", False, False, "cpu"),
    ],
)
def test_choose_device(
    monkeypatch: pytest.MonkeyPatch,
    requested: str,
    cuda: bool,
    mps: bool,
    expected: str,
) -> None:
    monkeypatch.setattr("torch.cuda.is_available", lambda: cuda)
    monkeypatch.setattr("torch.backends.mps.is_available", lambda: mps)
    assert choose_device(requested) == expected
