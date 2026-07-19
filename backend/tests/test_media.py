import base64
import io

import numpy as np
import pytest
import torch
from PIL import Image

from lerobot_lens.services.media import image_data_url, tensor_list


def decode_image(data_url: str) -> Image.Image:
    prefix, encoded = data_url.split(",", 1)
    assert prefix == "data:image/jpeg;base64"
    return Image.open(io.BytesIO(base64.b64decode(encoded)))


@pytest.mark.parametrize(
    ("value", "expected"),
    [
        (torch.tensor([[1.0, 2.0]]), [1.0, 2.0]),
        (np.asarray([[3, 4]], dtype=np.int16), [3.0, 4.0]),
        ([5, 6], [5.0, 6.0]),
    ],
)
def test_tensor_list_flattens_supported_values(value: object, expected: list[float]) -> None:
    assert tensor_list(value) == expected


@pytest.mark.parametrize(
    "value",
    [
        torch.ones((3, 2, 4), dtype=torch.float32),
        torch.full((2, 4, 3), 127, dtype=torch.uint8),
        torch.zeros((2, 4), dtype=torch.uint8),
        Image.new("RGBA", (4, 2), (255, 0, 0, 120)),
        np.zeros((2, 4, 3), dtype=np.uint8),
    ],
)
def test_image_data_url_encodes_tensor_pil_and_array(value: object) -> None:
    image = decode_image(image_data_url(value))
    assert image.mode == "RGB"
    assert image.size == (4, 2)
