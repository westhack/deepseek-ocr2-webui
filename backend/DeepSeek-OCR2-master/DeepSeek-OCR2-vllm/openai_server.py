import os
import tempfile
import numpy as np
import re
import img2pdf
from tqdm import tqdm
from functools import partial
from concurrent.futures import ThreadPoolExecutor

os.environ['VLLM_USE_V1'] = '0'

import httpx
import asyncio
import base64
import io
import json
import time
import uuid
from contextlib import asynccontextmanager
from typing import Optional, List

import fitz

from fastapi import FastAPI, UploadFile, Form
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from PIL import Image, ImageDraw, ImageFont

# Register custom model
from vllm.model_executor.models.registry import ModelRegistry
from deepseek_ocr2 import DeepseekOCR2ForCausalLM
ModelRegistry.register_model("DeepseekOCR2ForCausalLM", DeepseekOCR2ForCausalLM)

from vllm import AsyncLLMEngine, SamplingParams
from vllm.engine.arg_utils import AsyncEngineArgs
from process.ngram_norepeat import NoRepeatNGramLogitsProcessor
from process.image_process import DeepseekOCR2Processor
from config import MODEL_PATH, INPUT_PATH, OUTPUT_PATH, PROMPT, SKIP_REPEAT, MAX_CONCURRENCY, NUM_WORKERS, CROP_MODE
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, HTMLResponse

engine = None
processor = DeepseekOCR2Processor()

logits_processors = [NoRepeatNGramLogitsProcessor(ngram_size=20, window_size=50, whitelist_token_ids={128821,
                                                                                                      128822})]  # window for fast；whitelist_token_ids: <td>,</td>

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    global engine
    engine_args = AsyncEngineArgs(
        model=MODEL_PATH,
        hf_overrides={"architectures": ["DeepseekOCR2ForCausalLM"]},
        #dtype="bfloat16",
        max_model_len=int(os.environ.get("MAX_MODEL_LEN", "8192")),
        trust_remote_code=True,
        tensor_parallel_size=int(os.environ.get("TENSOR_PARALLEL_SIZE", "1")),
        gpu_memory_utilization=float(os.environ.get("GPU_MEMORY_UTILIZATION", "0.90")),
    )
    engine = AsyncLLMEngine.from_engine_args(engine_args)
    yield
    # Shutdown (cleanup if needed)


app = FastAPI(title="DeepSeek-OCR-2 OpenAI API", lifespan=lifespan)

# 配置 CORS 中间件
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # 允许所有来源（生产环境中建议指定具体域名）
    allow_credentials=True,
    allow_methods=["*"],  # 允许所有 HTTP 方法
    allow_headers=["*"],  # 允许所有请求头
)


def build_prompt(mode: str, custom_prompt: str = "", find_term: str = "") -> str:
    """构建提示词"""
    templates = {
        "document": "<image>\n<|grounding|>Convert the document to markdown.",
        "ocr": "<image>\n<|grounding|>OCR this image.",
        "free": "<image>\nFree OCR. Only output the raw text.",
        "figure": "<image>\nParse the figure.",
        "describe": "<image>\nDescribe this image in detail.",
        "find": "<image>\n<|grounding|>Locate <|ref|>{term}<|/ref|> in the image.",
        "freeform": "<image>\n{prompt}",
    }

    if mode == "find":
        return templates["find"].replace("{term}", find_term.strip() or "Total")
    elif mode == "freeform":
        return templates["freeform"].replace("{prompt}", custom_prompt.strip() or "OCR this image.")
    return templates.get(mode, templates["document"])


class ChatRequest(BaseModel):
    model: str
    messages: List[dict]
    max_tokens: Optional[int] = 8192
    temperature: Optional[float] = 0.0
    stream: Optional[bool] = False

class OcrRequest(BaseModel):
    model: str

@app.get("/v1/models")
async def list_models():
    return {
        "object": "list",
        "data": [{"id": "deepseek-ai/DeepSeek-OCR-2", "object": "model"}]
    }


@app.get("/health")
async def health():
    return {"status": "ok"}

async def extract_image_and_text(messages):
    """Extract image and text from OpenAI-style messages.
    Supports:
      - data:image;base64,...
      - http(s) remote image url
    """
    image = None
    text = ""
    pdf_bytes = None

    async with httpx.AsyncClient(timeout=30) as client:
        for msg in messages:
            content = msg.get("content", "")
            if isinstance(content, str):
                text += content

            elif isinstance(content, list):
                for item in content:
                    if not isinstance(item, dict):
                        continue

                    if item.get("type") == "text":
                        text += item.get("text", "")

                    elif item.get("type") == "image_url":
                        url = item.get("image_url", {}).get("url", "")
                        if not url:
                            continue

                        # base64
                        if url.startswith("data:"):
                            base64_data = url.split(",", 1)[1]
                            image_bytes = base64.b64decode(base64_data)
                            if image_bytes.startswith(b'%PDF-'):
                                pdf_bytes = image_bytes
                            else:
                                image = Image.open(io.BytesIO(image_bytes)).convert("RGB")

                        # remote http(s)
                        elif url.startswith("http://") or url.startswith("https://"):
                            resp = await client.get(url)
                            resp.raise_for_status()
                            content_type = resp.headers.get('content-type', '').lower()
                            if 'application/pdf' in content_type:
                                pdf_bytes = resp.content
                            else:
                                image = Image.open(io.BytesIO(resp.content)).convert("RGB")

    return image, text, pdf_bytes

@app.post("/v1/chat/completions")
async def chat_completions(request: ChatRequest):
    global engine
    image, text, pdf_bytes = await extract_image_and_text(request.messages)
    if pdf_bytes is not None:
         return await process_pdf(pdf_bytes, request)

    # Build prompt - ensure <image> tag is present for images
    if image and '<image>' not in text:
        prompt = f"<image>\n{text}"
    else:
        prompt = text

    # Process image using their processor (like run_dpsk_ocr2_image.py does)
    if image and '<image>' in prompt:
        image_features = processor.tokenize_with_images(
            images=[image], bos=True, eos=True, cropping=CROP_MODE
        )
        request_dict = {
            "prompt": prompt,
            "multi_modal_data": {"image": image_features}
        }
    else:
        request_dict = {"prompt": prompt}

    sampling_params = SamplingParams(
        temperature=request.temperature,
        max_tokens=request.max_tokens,
        skip_special_tokens=False,
    )

    request_id = f"chatcmpl-{uuid.uuid4().hex[:12]}"

    if request.stream:
        return StreamingResponse(
            stream_response(request_dict, sampling_params, request_id, request.model),
            media_type="text/event-stream"
        )
    else:
        full_text = ""
        async for output in engine.generate(request_dict, sampling_params, request_id):
            if output.outputs:
                full_text = output.outputs[0].text

        orig_w, orig_h = image.size
        return {
            "id": request_id,
            "object": "chat.completion",
            "created": int(time.time()),
            "model": request.model,
            "choices": [{
                "index": 0,
                "message": {"role": "assistant", "content": full_text, "orig_w": orig_w, "orig_h": orig_h},
                "finish_reason": "stop"
            }],
            "usage": {"prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0}
        }


async def stream_response(request_dict, sampling_params, request_id, model):
    prev_len = 0
    async for output in engine.generate(request_dict, sampling_params, request_id):
        if output.outputs:
            full_text = output.outputs[0].text
            delta = full_text[prev_len:]
            prev_len = len(full_text)
            if delta:
                chunk = {
                    "id": request_id,
                    "object": "chat.completion.chunk",
                    "created": int(time.time()),
                    "model": model,
                    "choices": [{"index": 0, "delta": {"content": delta}, "finish_reason": None}]
                }
                yield f"data: {json.dumps(chunk)}\n\n"

    chunk = {
        "id": request_id,
        "object": "chat.completion.chunk",
        "created": int(time.time()),
        "model": model,
        "choices": [{"index": 0, "delta": {}, "finish_reason": "stop"}]
    }
    yield f"data: {json.dumps(chunk)}\n\n"
    yield "data: [DONE]\n\n"

async def process_pdf(pdf_bytes, request: ChatRequest):
    """
    Process PDF file and return a list of images
    """
    if not request.stream:
        request_id = f"chatcmpl-{uuid.uuid4().hex[:12]}"
        res = await ocr_pdf_handle(pdf_bytes, request)
        return {
            "id": request_id,
            "object": "chat.completion",
            "created": int(time.time()),
            "model": request.model,
            "choices": [{
                "index": 0,
                "message": {"role": "assistant", "content": res['text']},
                "finish_reason": "stop"
            }],
            "usage": {"prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0}
        }
    else:
        stream_ocr_pdf_handle(pdf_bytes, request)

def pdf_to_images_high_quality(pdf_path, dpi=144, image_format="PNG"):
    """
    pdf2images
    """
    images = []

    pdf_document = fitz.open(pdf_path)

    zoom = dpi / 72.0
    matrix = fitz.Matrix(zoom, zoom)

    for page_num in range(pdf_document.page_count):
        page = pdf_document[page_num]

        pixmap = page.get_pixmap(matrix=matrix, alpha=False)
        Image.MAX_IMAGE_PIXELS = None

        if image_format.upper() == "PNG":
            img_data = pixmap.tobytes("png")
            img = Image.open(io.BytesIO(img_data))
        else:
            img_data = pixmap.tobytes("png")
            img = Image.open(io.BytesIO(img_data))
            if img.mode in ('RGBA', 'LA'):
                background = Image.new('RGB', img.size, (255, 255, 255))
                background.paste(img, mask=img.split()[-1] if img.mode == 'RGBA' else None)
                img = background

        images.append(img)

    pdf_document.close()
    return images

def extract_coordinates_and_label(ref_text, image_width, image_height):
    try:
        label_type = ref_text[1]
        cor_list = eval(ref_text[2])
    except Exception as e:
        print(e)
        return None

    return (label_type, cor_list)

def draw_bounding_boxes(image, refs, jdx):
    image_width, image_height = image.size
    img_draw = image.copy()
    draw = ImageDraw.Draw(img_draw)

    overlay = Image.new('RGBA', img_draw.size, (0, 0, 0, 0))
    draw2 = ImageDraw.Draw(overlay)

    #     except IOError:
    font = ImageFont.load_default()

    img_idx = 0

    for i, ref in enumerate(refs):
        try:
            result = extract_coordinates_and_label(ref, image_width, image_height)
            if result:
                label_type, points_list = result

                color = (np.random.randint(0, 200), np.random.randint(0, 200), np.random.randint(0, 255))

                color_a = color + (20,)
                for points in points_list:
                    x1, y1, x2, y2 = points

                    x1 = int(x1 / 999 * image_width)
                    y1 = int(y1 / 999 * image_height)

                    x2 = int(x2 / 999 * image_width)
                    y2 = int(y2 / 999 * image_height)

                    if label_type == 'image':
                        try:
                            cropped = image.crop((x1, y1, x2, y2))
                            cropped.save(f"{OUTPUT_PATH}/images/{jdx}_{img_idx}.jpg")
                        except Exception as e:
                            print(e)
                            pass
                        img_idx += 1

                    try:
                        if label_type == 'title':
                            draw.rectangle([x1, y1, x2, y2], outline=color, width=4)
                            draw2.rectangle([x1, y1, x2, y2], fill=color_a, outline=(0, 0, 0, 0), width=1)
                        else:
                            draw.rectangle([x1, y1, x2, y2], outline=color, width=2)
                            draw2.rectangle([x1, y1, x2, y2], fill=color_a, outline=(0, 0, 0, 0), width=1)

                        text_x = x1
                        text_y = max(0, y1 - 15)

                        text_bbox = draw.textbbox((0, 0), label_type, font=font)
                        text_width = text_bbox[2] - text_bbox[0]
                        text_height = text_bbox[3] - text_bbox[1]
                        draw.rectangle([text_x, text_y, text_x + text_width, text_y + text_height],
                                       fill=(255, 255, 255, 30))

                        draw.text((text_x, text_y), label_type, font=font, fill=color)
                    except:
                        pass
        except:
            continue
    img_draw.paste(overlay, (0, 0), overlay)
    return img_draw

def re_match(text):
    pattern = r'(<\|ref\|>(.*?)<\|/ref\|><\|det\|>(.*?)<\|/det\|>)'
    matches = re.findall(pattern, text, re.DOTALL)


    mathes_image = []
    mathes_other = []
    for a_match in matches:
        if '<|ref|>image<|/ref|>' in a_match[0]:
            mathes_image.append(a_match[0])
        else:
            mathes_other.append(a_match[0])
    return matches, mathes_image, mathes_other

def process_image_with_refs(image, ref_texts, jdx):
    result_image = draw_bounding_boxes(image, ref_texts, jdx)
    return result_image

def pil_to_pdf_img2pdf(pil_images, output_path):
    if not pil_images:
        return

    image_bytes_list = []

    for img in pil_images:
        if img.mode != 'RGB':
            img = img.convert('RGB')

        img_buffer = io.BytesIO()
        img.save(img_buffer, format='JPEG', quality=95)
        img_bytes = img_buffer.getvalue()
        image_bytes_list.append(img_bytes)

    try:
        pdf_bytes = img2pdf.convert(image_bytes_list)
        with open(output_path, "wb") as f:
            f.write(pdf_bytes)

    except Exception as e:
        print(f"error: {e}")

def process_single_image(image, prompt):
    """single image"""
    if image and '<image>' not in prompt:
        prompt_in = f"<image>\n{prompt}"
    else:
        prompt_in = prompt
    cache_item = {
        "prompt": prompt_in,
        "multi_modal_data": {"image": DeepseekOCR2Processor().tokenize_with_images(images = [image], bos=True, eos=True, cropping=CROP_MODE)},
    }
    return cache_item

async def ocr_pdf_handle(pdf_bytes, request: ChatRequest):
    tmp_file_path = None
    try:
        with tempfile.NamedTemporaryFile(delete=False, suffix=".pdf") as tmp_file:
            tmp_file.write(pdf_bytes)
            tmp_file_path = tmp_file.name

        images = pdf_to_images_high_quality(tmp_file_path)

        process_fn = partial(process_single_image, prompt=request.messages[0]["content"][0]["text"])

        with ThreadPoolExecutor(max_workers=NUM_WORKERS) as executor:
            batch_inputs = list(tqdm(
                executor.map(process_fn, images),
                total=len(images),
                desc="Pre-processed images"
            ))

        sampling_params = SamplingParams(
            temperature=request.temperature,
            max_tokens=request.max_tokens,
            logits_processors=logits_processors,
            skip_special_tokens=False,
            include_stop_str_in_output=True,
        )

        outputs_list = []
        request_id = f"pdfocr-{uuid.uuid4().hex[:8]}"
        for batch_input in batch_inputs:
            async for output in engine.generate(batch_input, sampling_params, request_id):
                outputs_list.append(output)

        output_path = OUTPUT_PATH

        os.makedirs(output_path, exist_ok=True)
        os.makedirs(f'{output_path}/images', exist_ok=True)

        mmd_det_path = output_path + '/' + request_id + '_det.md'
        mmd_path = output_path + '/' + request_id + '.md'
        pdf_out_path = output_path + '/' + request_id + '_layouts.pdf'
        contents_det = ''
        contents = ''
        draw_images = []
        jdx = 0
        for batch_input, img in zip(batch_inputs, images):
            async for output in engine.generate(batch_input, sampling_params, request_id):
                if output.outputs:
                    content = output.outputs[0].text
                    if '<｜end▁of▁sentence｜>' in content:  # repeat no eos
                        content = content.replace('<｜end▁of▁sentence｜>', '')
                    else:
                        if SKIP_REPEAT:
                            continue

                    page_num = f'\n<--- Page Split --->'

                    contents_det += content + f'\n{page_num}\n'

                    image_draw = img.copy()

                    matches_ref, matches_images, mathes_other = re_match(content)
                    # print(matches_ref)
                    result_image = process_image_with_refs(image_draw, matches_ref, jdx)

                    draw_images.append(result_image)

                    for idx, a_match_image in enumerate(matches_images):
                        content = content.replace(a_match_image, f'![](images/' + str(jdx) + '_' + str(idx) + '.jpg)\n')

                    for idx, a_match_other in enumerate(mathes_other):
                        content = content.replace(a_match_other, '').replace('\\coloneqq', ':=').replace('\\eqqcolon',
                                                                                                         '=:').replace(
                            '\n\n\n\n', '\n\n').replace('\n\n\n', '\n\n')

                    contents += content + f'\n{page_num}\n'

                    jdx += 1

        with open(mmd_det_path, 'w', encoding='utf-8') as afile:
            afile.write(contents_det)

        with open(mmd_path, 'w', encoding='utf-8') as afile:
            afile.write(contents)

        pil_to_pdf_img2pdf(draw_images, pdf_out_path)

        return {
            "code": 200,
            "success": True,
            "images": len(images),
            "text": contents,
            "raw_text": contents_det,
            "mmd_det_path": mmd_det_path,
            "mmd_path": mmd_path,
            "pdf_out_path": pdf_out_path,
        }
    finally:
        if tmp_file_path and os.path.exists(tmp_file_path):
            os.unlink(tmp_file_path)

async def stream_ocr_pdf_handle(pdf_bytes, request: ChatRequest):
    model = request.model
    prev_len = 0
    tmp_file_path = None
    try:
        with tempfile.NamedTemporaryFile(delete=False, suffix=".pdf") as tmp_file:
            tmp_file.write(pdf_bytes)
            tmp_file_path = tmp_file.name

        images = pdf_to_images_high_quality(tmp_file_path)

        process_fn = partial(process_single_image, prompt=request.messages[0]["content"][0]["text"])

        with ThreadPoolExecutor(max_workers=NUM_WORKERS) as executor:
            batch_inputs = list(tqdm(
                executor.map(process_fn, images),
                total=len(images),
                desc="Pre-processed images"
            ))

        sampling_params = SamplingParams(
            temperature=request.temperature,
            max_tokens=request.max_tokens,
            logits_processors=logits_processors,
            skip_special_tokens=False,
            include_stop_str_in_output=True,
        )
        request_id = f"pdfocr-{uuid.uuid4().hex[:8]}"

        output_path = OUTPUT_PATH

        os.makedirs(output_path, exist_ok=True)
        os.makedirs(f'{output_path}/images', exist_ok=True)

        mmd_det_path = output_path + '/' + request_id + '_det.md'
        mmd_path = output_path + '/' + request_id + '.md'
        pdf_out_path = output_path + '/' + request_id + '_layouts.pdf'
        contents_det = ''
        contents = ''
        draw_images = []
        jdx = 0
        for batch_input, img in zip(batch_inputs, images):
            async for output in engine.generate(batch_input, sampling_params, request_id):
                if output.outputs:
                    full_text = output.outputs[0].text
                    delta = full_text[prev_len:]
                    prev_len = len(full_text)
                    if delta:
                        chunk = {
                            "id": request_id,
                            "object": "chat.completion.chunk",
                            "created": int(time.time()),
                            "model": model,
                            "choices": [{"index": 0, "delta": {"content": delta}, "finish_reason": None}]
                        }
                        yield f"data: {json.dumps(chunk)}\n\n"

                    if '<｜end▁of▁sentence｜>' in content:  # repeat no eos
                        content = content.replace('<｜end▁of▁sentence｜>', '')
                    else:
                        if SKIP_REPEAT:
                            continue

                    page_num = f'\n<--- Page Split --->'

                    contents_det += content + f'\n{page_num}\n'

                    image_draw = img.copy()

                    matches_ref, matches_images, mathes_other = re_match(content)
                    # print(matches_ref)
                    result_image = process_image_with_refs(image_draw, matches_ref, jdx)

                    draw_images.append(result_image)

                    for idx, a_match_image in enumerate(matches_images):
                        content = content.replace(a_match_image, f'![](images/' + str(jdx) + '_' + str(idx) + '.jpg)\n')

                    for idx, a_match_other in enumerate(mathes_other):
                        content = content.replace(a_match_other, '').replace('\\coloneqq', ':=').replace('\\eqqcolon',
                                                                                                         '=:').replace(
                            '\n\n\n\n', '\n\n').replace('\n\n\n', '\n\n')

                    contents += content + f'\n{page_num}\n'

                    jdx += 1

        with open(mmd_det_path, 'w', encoding='utf-8') as afile:
            afile.write(contents_det)

        with open(mmd_path, 'w', encoding='utf-8') as afile:
            afile.write(contents)

        pil_to_pdf_img2pdf(draw_images, pdf_out_path)

        chunk = {
            "id": request_id,
            "object": "chat.completion.chunk",
            "created": int(time.time()),
            "model": model,
            "choices": [{"index": 0, "delta": {}, "finish_reason": "stop"}]
        }
        yield f"data: {json.dumps(chunk)}\n\n"
        yield "data: [DONE]\n\n"
    finally:
        if tmp_file_path and os.path.exists(tmp_file_path):
            os.unlink(tmp_file_path)

async def download_file(url):
    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.get(url)
        pdf_bytes = resp.content
        content_type = resp.headers.get('content-type', '').lower()
        if 'application/pdf' in content_type:
            return pdf_bytes, 'pdf'
        else:
            return pdf_bytes, 'image'


def clean_grounding_text(text: str) -> str:
    """移除grounding标记，保留标签"""
    cleaned = re.sub(
        r"<\|ref\|>(.*?)<\|/ref\|>\s*<\|det\|>\s*\[.*\]\s*<\|/det\|>",
        r"\1",
        text,
        flags=re.DOTALL,
    )
    cleaned = re.sub(r"<\|grounding\|>", "", cleaned)
    return cleaned.strip()


def parse_detections(text: str, image_width: int, image_height: int):
    """解析grounding boxes并缩放坐标"""
    boxes = []

    # 匹配detection块
    DET_BLOCK = re.compile(
        r"<\|ref\|>(?P<label>.*?)<\|/ref\|>\s*<\|det\|>\s*(?P<coords>\[.*?\])\s*<\|/det\|>",
        re.DOTALL,
    )

    for m in DET_BLOCK.finditer(text or ""):
        label = m.group("label").strip()
        coords_str = m.group("coords").strip()

        try:
            import ast
            parsed = ast.literal_eval(coords_str)

            # 标准化为列表的列表
            if isinstance(parsed, list) and len(parsed) == 4 and all(isinstance(n, (int, float)) for n in parsed):
                box_coords = [parsed]
            elif isinstance(parsed, list):
                box_coords = parsed
            else:
                continue

            # 处理每个box
            for box in box_coords:
                if isinstance(box, (list, tuple)) and len(box) >= 4:
                    # 从0-999归一化坐标转换为实际像素坐标
                    x1 = int(float(box[0]) / 999 * image_width)
                    y1 = int(float(box[1]) / 999 * image_height)
                    x2 = int(float(box[2]) / 999 * image_width)
                    y2 = int(float(box[3]) / 999 * image_height)
                    boxes.append({"label": label, "box": [x1, y1, x2, y2]})
        except Exception as e:
            print(f"解析坐标失败: {e}")
            continue

    return boxes

@app.post("/ocr")
async def ocr(
        file: UploadFile = None,
        fileUrl: str = Form(''),
        prompt_type: str = Form("document"),
        find_term: str = Form(""),
        custom_prompt: str = Form(""),
        grounding: bool = Form(False),
        max_tokens: Optional[int] =  Form(8192),
        temperature: Optional[float] =  Form(0.0)
):
    # 构建提示词
    prompt = build_prompt(prompt_type, custom_prompt, find_term)
    request = ChatRequest(
        model="deepseek-ai/DeepSeek-OCR-2",
        messages=[
            {
                "role": "user",
                "content": [
                    {"type": "text", "text": prompt},
                    {
                        "type": "image_url",
                        "image_url": {
                            "url": ""
                        }
                    }
                ]},
        ],
        max_tokens=max_tokens,
        temperature=temperature,
        stream=False
    )
    pdf_bytes = None
    if fileUrl and fileUrl.startswith('http'):
        pdf_bytes, file_type = await download_file(fileUrl)
    else:
        pdf_bytes = await file.read()

    content_start = pdf_bytes[:1024]
    if b'%PDF-' in content_start:
        data = await ocr_pdf_handle(pdf_bytes, request)
        return JSONResponse(data)

    pdf_base64 = base64.b64encode(pdf_bytes).decode('utf-8')
    request.messages[0]['content'][1]['image_url']["url"] = f'data:image/jpeg;base64,{pdf_base64}'
    res = await chat_completions(request)

    boxes = []
    result_text = res['choices'][0]['message']['content']
    display_text = res['choices'][0]['message']['content']
    orig_w = res['choices'][0]['message']['orig_w']
    orig_h = res['choices'][0]['message']['orig_h']

    # 解析grounding boxes
    boxes = []
    if "<|det|>" in result_text or "<|ref|>" in result_text:
        boxes = parse_detections(result_text, orig_w, orig_h)

    # 清理显示文本（移除grounding标记）
    display_text = clean_grounding_text(result_text)

    # 如果显示文本为空但有boxes，显示标签
    if not display_text and boxes:
        display_text = ", ".join([b["label"] for b in boxes])

    return JSONResponse({
        "code": 200,
        "success": True,
        "text": display_text,
        "raw_text": result_text,
        "boxes": boxes,
        "image_dims": {"w": orig_w, "h": orig_h},
        "prompt_type": prompt_type,
        "metadata": {
            "mode": prompt_type,
            "grounding": grounding or (prompt_type in ["find", "document", "ocr"]),
            "has_boxes": len(boxes) > 0
         }
     })

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
