from __future__ import annotations

import base64
import io
from typing import Any

import numpy as np
import torch
from PIL import Image


def tensor_list(value: Any) -> list[float]:
    if isinstance(value, torch.Tensor):
        return value.detach().cpu().flatten().tolist()
    return np.asarray(value).flatten().astype(float).tolist()


def image_data_url(value: Any) -> str:
    if isinstance(value, torch.Tensor):
        array = value.detach().cpu().numpy()
        if array.ndim == 3 and array.shape[0] in (1, 3, 4):
            array = np.moveaxis(array, 0, -1)
        if array.dtype != np.uint8:
            array = (np.clip(array, 0, 1) * 255).astype(np.uint8)
        image = Image.fromarray(array)
    elif isinstance(value, Image.Image):
        image = value
    else:
        image = Image.fromarray(np.asarray(value).astype(np.uint8))
    buffer = io.BytesIO()
    image.convert("RGB").save(buffer, "JPEG", quality=82)
    return "data:image/jpeg;base64," + base64.b64encode(buffer.getvalue()).decode()
