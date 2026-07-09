import http.server
import socketserver
import traceback
import sys
import os
import urllib.request
import urllib.error

PORT = 8000
BIND_ADDRESS = "127.0.0.1"

# Servir a pasta atual (onde está o index.html)
DIRECTORY = os.path.dirname(os.path.abspath(__file__))
CLICKUP_TOKEN = os.environ.get("CLICKUP_TOKEN", "pk_90848927_3RNB3KVYA0ZBY9YILUOJAH7RUKD61437")

class MyHTTPRequestHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=DIRECTORY, **kwargs)

    def do_GET(self):
        if self.path.startswith('/clickup-api/'):
            self.handle_proxy()
        else:
            super().do_GET()

    def do_POST(self):
        if self.path.startswith('/clickup-api/'):
            self.handle_proxy()
        else:
            super().do_POST()

    def do_PUT(self):
        if self.path.startswith('/clickup-api/'):
            self.handle_proxy()
        else:
            # SimpleHTTPRequestHandler não implementa do_PUT por padrão
            self.send_error(405, "Method not allowed")

    def handle_proxy(self):
        # Extrair o subcaminho da API
        # Exemplo: /clickup-api/task/123 -> https://api.clickup.com/api/v2/task/123
        subpath = self.path[len('/clickup-api/'):]
        target_url = f"https://api.clickup.com/api/v2/{subpath}"
        
        # Obter o body do request
        content_length = int(self.headers.get('Content-Length', 0))
        body = self.rfile.read(content_length) if content_length > 0 else None

        # Montar a requisição
        req = urllib.request.Request(
            target_url,
            data=body,
            headers={
                "Authorization": CLICKUP_TOKEN,
                "Content-Type": "application/json"
            },
            method=self.command
        )

        try:
            with urllib.request.urlopen(req) as response:
                res_body = response.read()
                self.send_response(response.status)
                # Copiar headers essenciais
                for key, val in response.headers.items():
                    if key.lower() in ['content-type', 'access-control-allow-origin', 'access-control-allow-methods', 'access-control-allow-headers']:
                        self.send_header(key, val)
                self.end_headers()
                self.wfile.write(res_body)
        except urllib.error.HTTPError as e:
            res_body = e.read()
            self.send_response(e.code)
            for key, val in e.headers.items():
                if key.lower() in ['content-type', 'access-control-allow-origin', 'access-control-allow-methods', 'access-control-allow-headers']:
                    self.send_header(key, val)
            self.end_headers()
            self.wfile.write(res_body)
        except Exception as e:
            self.send_response(500)
            self.end_headers()
            self.wfile.write(str(e).encode('utf-8'))

    def log_message(self, format, *args):
        log_line = "%s - - [%s] %s\n" % (
            self.client_address[0],
            self.log_date_time_string(),
            format % args
        )
        sys.stdout.write(log_line)
        sys.stdout.flush()

class TCPServerReuse(socketserver.TCPServer):
    allow_reuse_address = True

if __name__ == "__main__":
    print(f"Iniciando servidor customizado na pasta: {DIRECTORY}")
    sys.stdout.flush()
    try:
        handler = MyHTTPRequestHandler
        with TCPServerReuse((BIND_ADDRESS, PORT), handler) as httpd:
            print(f"Servidor ouvindo com sucesso em http://{BIND_ADDRESS}:{PORT}")
            sys.stdout.flush()
            httpd.serve_forever()
    except Exception as e:
        sys.stderr.write("Erro crítico no servidor:\n")
        traceback.print_exc(file=sys.stderr)
        sys.stderr.flush()
        sys.exit(1)
