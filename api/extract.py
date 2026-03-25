import base64
import io
import json
import re
import urllib.request
from http.server import BaseHTTPRequestHandler

try:
    import fitz  # PyMuPDF
    FITZ_AVAILABLE = True
except ImportError:
    FITZ_AVAILABLE = False

from pypdf import PdfReader
import pdfplumber


MAX_UPLOAD_BYTES = 25 * 1024 * 1024


def _extract_text(pdf_bytes: bytes) -> str:
    reader = PdfReader(io.BytesIO(pdf_bytes))
    chunks = []
    for page in reader.pages:
        chunks.append(page.extract_text() or "")

    text = "\n\n".join(chunks)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


def _extract_tables(pdf_bytes: bytes):
    tables = []
    with pdfplumber.open(io.BytesIO(pdf_bytes)) as pdf:
        for page in pdf.pages:
            page_tables = page.extract_tables() or []
            for raw_table in page_tables:
                if not raw_table:
                    continue
                headers = [str(cell or "").strip() for cell in (raw_table[0] or [])]
                rows = [
                    [str(cell or "").strip() for cell in row]
                    for row in raw_table[1:]
                    if row is not None
                ]
                if headers or rows:
                    tables.append(
                        {
                            "title": "Extracted Table",
                            "headers": headers,
                            "rows": rows,
                            "footnote": "",
                        }
                    )
    return tables





def _fetch_pdf_from_url(signed_url: str):
    """Download PDF bytes from a Supabase signed URL."""
    try:
        req = urllib.request.Request(signed_url, headers={"User-Agent": "extract-worker/1.0"})
        with urllib.request.urlopen(req, timeout=30) as resp:
            pdf_bytes = resp.read()
    except Exception as exc:
        return None, f"Failed to download PDF: {exc}"

    if len(pdf_bytes) > MAX_UPLOAD_BYTES:
        return None, "PDF is too large (max 25 MB)"

    if not pdf_bytes.startswith(b"%PDF"):
        return None, "Downloaded file is not a valid PDF"

    return pdf_bytes, None


MIN_IMAGE_PIXELS = 50 * 50
MAX_FIGURES = 100


def _extract_figures(pdf_bytes: bytes):
    """Extract embedded images from the PDF using PyMuPDF."""
    if not FITZ_AVAILABLE:
        return []
    figures = []
    doc = fitz.open(stream=pdf_bytes, filetype="pdf")
    seen_digests = set()

    for page_index, page in enumerate(doc):
        image_list = page.get_images(full=True)
        for img_info in image_list:
            xref = img_info[0]
            try:
                base_image = doc.extract_image(xref)
            except Exception:
                continue

            if not base_image or not base_image.get("image"):
                continue

            img_bytes = base_image["image"]
            width = base_image.get("width", 0)
            height = base_image.get("height", 0)

            # Skip tiny images (icons, bullets, decorations)
            if width * height < MIN_IMAGE_PIXELS:
                continue

            # Deduplicate identical images across pages
            digest = hash(img_bytes)
            if digest in seen_digests:
                continue
            seen_digests.add(digest)

            ext = base_image.get("ext", "png")
            # Normalise to png/jpeg for frontend compatibility
            if ext not in ("png", "jpeg", "jpg"):
                ext = "png"

            figure_index = len(figures) + 1
            figures.append(
                {
                    "label": f"Figure {figure_index}",
                    "caption": "",
                    "description": f"Page {page_index + 1}, {width}x{height}px",
                    "type": ext,
                    "image_b64": base64.b64encode(img_bytes).decode("ascii"),
                }
            )

            if len(figures) >= MAX_FIGURES:
                break
        if len(figures) >= MAX_FIGURES:
            break

    doc.close()
    return figures


def _send_json(handler_self, payload, status=200):
    body = json.dumps(payload).encode("utf-8")
    handler_self.send_response(status)
    handler_self.send_header("Content-Type", "application/json")
    handler_self.send_header("Content-Length", str(len(body)))
    handler_self.end_headers()
    handler_self.wfile.write(body)


class handler(BaseHTTPRequestHandler):
    """Vercel Python serverless function — must be a BaseHTTPRequestHandler subclass."""

    def do_POST(self):
        content_length = int(self.headers.get("content-length", 0))
        body = self.rfile.read(content_length) if content_length else b""

        try:
            data = json.loads(body)
        except Exception:
            _send_json(self, {"error": "Invalid JSON body"}, status=400)
            return

        signed_url = data.get("signed_url", "")
        if not signed_url:
            _send_json(self, {"error": "Missing signed_url"}, status=400)
            return

        pdf_bytes, download_error = _fetch_pdf_from_url(signed_url)
        if download_error:
            _send_json(self, {"error": download_error}, status=400)
            return

        try:
            text = _extract_text(pdf_bytes)
            tables = _extract_tables(pdf_bytes)
            figures = _extract_figures(pdf_bytes)
            _send_json(self, {"text": text, "tables": tables, "figures": figures})
        except Exception as exc:  # pragma: no cover
            _send_json(self, {"error": str(exc)}, status=500)

    def do_GET(self):
        _send_json(self, {"error": "Method not allowed"}, status=405)

    def log_message(self, *args):  # silence default request logging
        pass
