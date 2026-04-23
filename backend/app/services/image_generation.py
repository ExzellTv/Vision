import asyncio
import httpx
from app.config import settings

REPLICATE_API_BASE = "https://api.replicate.com/v1"
FLUX_MODEL = "black-forest-labs/flux-kontext-pro"

STYLE_PROMPTS = {
    "modern exterior": "Transform into a photorealistic modern residential exterior with clean lines, large windows, flat or low-slope roof, contemporary landscaping, and golden hour lighting",
    "contemporary": "Transform into a photorealistic contemporary house exterior with mixed materials, warm architectural lighting, and professional photography quality",
    "traditional": "Transform into a photorealistic traditional American house exterior with brick and siding, gable roof, mature landscaping, and warm sunset lighting",
    "minimalist": "Transform into a photorealistic minimalist residential exterior with white walls, simple geometry, zen landscaping, and soft natural light",
    "luxury": "Transform into a photorealistic luxury modern mansion with high-end finishes, dramatic lighting, and manicured grounds",
    "craftsman": "Transform into a photorealistic craftsman style house with exposed beams, natural wood accents, stone details, and a covered front porch",
}


async def render_with_flux(
    screenshot_base64: str,
    style: str = "modern exterior",
) -> dict:
    token = settings.replicate_api_token
    if not token:
        raise ValueError("REPLICATE_API_TOKEN not configured")

    if not screenshot_base64.startswith("data:"):
        screenshot_base64 = f"data:image/png;base64,{screenshot_base64}"

    prompt = STYLE_PROMPTS.get(style, STYLE_PROMPTS["modern exterior"])

    headers = {
        "Authorization": f"Token {token}",
        "Content-Type": "application/json",
        "Prefer": "wait",
    }

    payload = {
        "input": {
            "prompt": prompt,
            "input_image": screenshot_base64,
            "output_format": "jpg",
        }
    }

    async with httpx.AsyncClient(timeout=180.0) as client:
        resp = await client.post(
            f"{REPLICATE_API_BASE}/models/{FLUX_MODEL}/predictions",
            json=payload,
            headers=headers,
        )
        if resp.status_code not in (200, 201):
            raise RuntimeError(f"Replicate error {resp.status_code}: {resp.text}")

        prediction = resp.json()
        prediction_id = prediction.get("id")
        status = prediction.get("status")
        output = prediction.get("output")

        for _ in range(60):
            if status in ("succeeded", "failed", "canceled"):
                break
            await asyncio.sleep(2)
            poll = await client.get(
                f"{REPLICATE_API_BASE}/predictions/{prediction_id}",
                headers=headers,
            )
            data = poll.json()
            status = data.get("status")
            output = data.get("output")

        if status != "succeeded" or not output:
            raise RuntimeError(f"Replicate prediction {status}: {prediction.get('error') or status}")

        image_url = output.url() if hasattr(output, "url") else (output[0] if isinstance(output, list) else output)
        return {"url": image_url, "style": style, "prediction_id": prediction_id}
