import http.server
import socketserver
import webbrowser
import threading
import sys

PORT = 5500


class NoCacheHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-cache, no-store, must-revalidate")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        super().end_headers()

    def log_message(self, *args):
        pass  # keep the terminal quiet


class ThreadingHTTPServer(socketserver.ThreadingMixIn, http.server.HTTPServer):
    daemon_threads = True
    allow_reuse_address = True


if __name__ == '__main__':
    url = f"http://localhost:{PORT}"
    try:
        httpd = ThreadingHTTPServer(("", PORT), NoCacheHandler)
    except OSError as e:
        print(f"\n  Could not start on port {PORT} — it may already be running.\n  Just open {url} in your browser.\n  ({e})\n")
        sys.exit(1)

    print("\n  ┌─────────────────────────────────────────────┐")
    print("  │   CampusCare is running                     │")
    print(f"  │   Open:  {url}                │")
    print("  │   Stop:  press Ctrl + C                     │")
    print("  └─────────────────────────────────────────────┘\n")

    # Open the app in the default browser automatically (so you never
    # open it as a file:// — Google login only works over http://localhost).
    threading.Timer(1.0, lambda: webbrowser.open(url)).start()

    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\n  Stopped.\n")
