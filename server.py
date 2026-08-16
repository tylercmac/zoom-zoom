from http.server import HTTPServer, SimpleHTTPRequestHandler
import mimetypes
import os
import threading
import time
from urllib.parse import urlsplit

# Ensure .js served with correct MIME type for ES modules
mimetypes.add_type('application/javascript', '.js')

ROOT = r"C:\Users\Ty McFarland\Desktop\Programming\zoom-zoom"
PORT = 8000
os.chdir(ROOT)

# Shared state for reload notifications
_last_mtime = 0
_mtime_lock = threading.Lock()


def scan_max_mtime(root):
    max_m = 0
    for dirpath, dirnames, filenames in os.walk(root):
        for fn in filenames:
            try:
                fp = os.path.join(dirpath, fn)
                m = os.path.getmtime(fp)
                if m > max_m:
                    max_m = m
            except Exception:
                pass
    return max_m


class Handler(SimpleHTTPRequestHandler):
    def guess_type(self, path):
        # Strip query strings before checking the extension so cache-busted URLs still resolve as JS modules.
        clean_path = urlsplit(path).path
        base, ext = os.path.splitext(clean_path)
        if ext == '.js':
            return 'application/javascript'
        return super().guess_type(clean_path)

    def end_headers(self):
        # Disable caching for development
        self.send_header('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0')
        self.send_header('Pragma', 'no-cache')
        super().end_headers()

    def do_GET(self):
        # Server-Sent Events endpoint for reload notifications
        if self.path == '/__reload':
            self.send_response(200)
            self.send_header('Content-Type', 'text/event-stream')
            self.send_header('Cache-Control', 'no-cache')
            self.send_header('Connection', 'keep-alive')
            self.end_headers()
            # Keep a local copy of last seen mtime
            local_m = 0
            # Send an initial comment to establish the stream
            try:
                self.wfile.write(b": connected\n\n")
                self.wfile.flush()
            except Exception:
                return
            while True:
                with _mtime_lock:
                    global _last_mtime
                    lm = _last_mtime
                if lm > local_m:
                    try:
                        self.wfile.write(b"data: reload\n\n")
                        self.wfile.flush()
                    except Exception:
                        break
                    local_m = lm
                time.sleep(0.5)
            return
        else:
            return super().do_GET()


# Background thread to watch for file changes and update _last_mtime
def watcher_thread(root):
    global _last_mtime
    _last_mtime = scan_max_mtime(root)
    while True:
        try:
            m = scan_max_mtime(root)
            with _mtime_lock:
                if m > _last_mtime:
                    _last_mtime = m
            time.sleep(0.5)
        except Exception:
            time.sleep(1)


httpd = HTTPServer(('0.0.0.0', PORT), Handler)
print(f"Serving {ROOT} at http://0.0.0.0:{PORT}")

# Start watcher
t = threading.Thread(target=watcher_thread, args=(ROOT,), daemon=True)
t.start()

try:
    httpd.serve_forever()
except KeyboardInterrupt:
    print('Shutting down')
    httpd.server_close()
