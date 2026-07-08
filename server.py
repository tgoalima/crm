import http.server
import socketserver
import traceback
import sys
import os

PORT = 8080
BIND_ADDRESS = "127.0.0.1"

# Servir a pasta atual (onde está o index.html)
DIRECTORY = os.path.dirname(os.path.abspath(__file__))

class MyHTTPRequestHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=DIRECTORY, **kwargs)

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
        # Bind explícito
        with TCPServerReuse((BIND_ADDRESS, PORT), handler) as httpd:
            print(f"Servidor ouvindo com sucesso em http://{BIND_ADDRESS}:{PORT}")
            sys.stdout.flush()
            httpd.serve_forever()
    except Exception as e:
        sys.stderr.write("Erro crítico no servidor:\n")
        traceback.print_exc(file=sys.stderr)
        sys.stderr.flush()
        sys.exit(1)
