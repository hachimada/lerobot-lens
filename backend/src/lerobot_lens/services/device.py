import logging

import torch

logger = logging.getLogger(__name__)


def choose_device(requested: str) -> str:
    """Resolve a requested accelerator to one available on this machine."""

    if requested == "cpu":
        return "cpu"
    if requested == "cuda" and torch.cuda.is_available():
        return "cuda"
    if requested == "mps" and torch.backends.mps.is_available():
        return "mps"
    if requested != "auto":
        logger.warning("Requested device '%s' is unavailable; selecting a safe device", requested)
    if torch.cuda.is_available():
        return "cuda"
    if torch.backends.mps.is_available():
        return "mps"
    return "cpu"
