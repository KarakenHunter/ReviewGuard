"""FAKE Cloudflare Workers AI, used ONLY for integration tests of the Express <-> FastAPI contract.
It returns keyword-based canned outputs. It is NOT a model and proves nothing about real inference.
Trigger words in the review text: TRIGGER_QUOTA (429), TRIGGER_5XX (500), TRIGGER_BADJSON (emotion model returns non-JSON).
GET /__count returns the number of inference requests received."""
import json
import sys
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

NEG = ("terrible", "worst", "broke", "awful", "scam", "disappointed", "hate", "refund")
JOY = ("love", "great", "best", "wonderful", "amazing", "perfect")
COUNT = {"n": 0}


def emotion_for(text: str) -> dict:
    t = text.lower()
    s = dict(anger=0.02, disgust=0.02, fear=0.02, joy=0.02, sadness=0.02, surprise=0.02, neutral=0.88)
    if any(w in t for w in ("worst", "scam", "terrible")):
        s.update(anger=0.85, disgust=0.05, neutral=0.02)
    elif any(w in t for w in ("disappointed", "broke", "refund")):
        s.update(sadness=0.6, anger=0.15, neutral=0.15)
    elif any(w in t for w in JOY):
        s.update(joy=0.9, neutral=0.04)
    return s


class H(BaseHTTPRequestHandler):
    def log_message(self, *a):
        pass

    def _send(self, status, obj):
        data = json.dumps(obj).encode()
        self.send_response(status)
        self.send_header("content-type", "application/json")
        self.send_header("content-length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self):
        self._send(200, {"n": COUNT["n"]})

    def do_POST(self):
        body = json.loads(self.rfile.read(int(self.headers["content-length"])))
        COUNT["n"] += 1
        model = self.path.split("/ai/run/")[1]
        is_sent = "distilbert" in model
        text = body["text"] if is_sent else body["messages"][1]["content"]
        if "TRIGGER_QUOTA" in text:
            return self._send(429, {"success": False, "errors": [{"code": 4006, "message": "you have used up your daily free allocation"}]})
        if "TRIGGER_5XX" in text:
            return self._send(500, {"success": False, "errors": [{"code": 5000, "message": "boom"}]})
        if is_sent:
            low = text.lower()
            pos = 0.02 if any(w in low for w in NEG) else (0.98 if any(w in low for w in JOY) else 0.55)
            return self._send(200, {"success": True, "result": {"items": [{"label": "POSITIVE", "score": pos}, {"label": "NEGATIVE", "score": 1 - pos}]}})
        if "TRIGGER_BADJSON" in text:
            return self._send(200, {"success": True, "result": {"response": "definitely not json"}})
        return self._send(200, {"success": True, "result": {"response": json.dumps(emotion_for(text))}})


if __name__ == "__main__":
    ThreadingHTTPServer(("127.0.0.1", int(sys.argv[1])), H).serve_forever()
