from pathlib import Path

from PIL import Image


SOURCE = Path("data/exports/kca-liquid-detergent-products.png")
OUTPUT = Path("assets/detergents")

# Crop coordinates point only at the product packshots on page 14 of the
# 2025 Korea Consumer Agency liquid detergent comparison report.
CROPS = {
    "downy": (112, 215, 318, 661),
    "liq": (516, 217, 758, 681),
    "beat": (963, 215, 1216, 681),
    "snuggle": (1397, 211, 1666, 681),
    "acts": (86, 742, 328, 1194),
    "tech": (506, 742, 766, 1194),
    "persil": (951, 742, 1219, 1194),
    "fi-ji": (1395, 742, 1668, 1194),
}


def build_packshot(image: Image.Image, box: tuple[int, int, int, int]) -> Image.Image:
    crop = image.crop(box)
    crop.thumbnail((390, 390), Image.Resampling.LANCZOS)
    output = Image.new("RGB", (440, 440), "white")
    x = (output.width - crop.width) // 2
    y = (output.height - crop.height) // 2
    output.paste(crop, (x, y))
    return output


def main() -> None:
    OUTPUT.mkdir(parents=True, exist_ok=True)
    source = Image.open(SOURCE).convert("RGB")
    for product_id, box in CROPS.items():
        target = OUTPUT / f"{product_id}.webp"
        build_packshot(source, box).save(target, "WEBP", quality=88, method=6)
        print(target)


if __name__ == "__main__":
    main()
