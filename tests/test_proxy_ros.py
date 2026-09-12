import ast
import contextlib
import io
import json
import os
import urllib.request
import unittest
from pathlib import Path
from types import SimpleNamespace


class ProxyRosLocalTest(unittest.TestCase):
    def test_servidor_local_expoe_proxy_da_edge_function_de_ros(self):
        tree = ast.parse(Path('server.py').read_text())
        handler = next(node for node in tree.body if isinstance(node, ast.ClassDef) and node.name == 'MyHTTPRequestHandler')
        metodos = {node.name for node in handler.body if isinstance(node, ast.FunctionDef)}
        self.assertIn('handle_proxy_edge_function', metodos, 'O servidor local precisa encaminhar /api/ros para a Edge Function api-ros.')

    def test_proxy_preserva_consulta_e_autorizacao_para_edge_function(self):
        tree = ast.parse(Path('server.py').read_text())
        handler = next(node for node in tree.body if isinstance(node, ast.ClassDef) and node.name == 'MyHTTPRequestHandler')
        method = next(node for node in handler.body if isinstance(node, ast.FunctionDef) and node.name == 'handle_proxy_edge_function')
        namespace = {'os': os, 'urllib': __import__('urllib'), 'json': json}
        exec(compile(ast.Module(body=[method], type_ignores=[]), 'server.py', 'exec'), namespace)
        capturado = {}

        class Resposta:
            status = 200
            headers = {'Content-Type': 'application/json'}
            def read(self): return b'{"data":[]}'
            def __enter__(self): return self
            def __exit__(self, *args): return False

        def abrir(request, timeout):
            capturado['url'] = request.full_url
            capturado['authorization'] = request.get_header('Authorization')
            capturado['timeout'] = timeout
            return Resposta()

        original = urllib.request.urlopen
        anterior = os.environ.get('SUPABASE_URL')
        os.environ['SUPABASE_URL'] = 'https://supabase.exemplo.test'
        urllib.request.urlopen = abrir
        try:
            status = []
            resposta = io.BytesIO()
            fake = SimpleNamespace(
                path='/api/ros?pagina=2&situacao=Aprovada', command='GET',
                headers={'Authorization': 'token-clickup'}, rfile=io.BytesIO(), wfile=resposta,
                send_response=status.append, send_header=lambda *args: None, end_headers=lambda: None,
            )
            namespace['handle_proxy_edge_function'](fake, 'api-ros', '/api/ros')
        finally:
            urllib.request.urlopen = original
            if anterior is None: os.environ.pop('SUPABASE_URL', None)
            else: os.environ['SUPABASE_URL'] = anterior

        self.assertEqual(status, [200])
        self.assertEqual(capturado['url'], 'https://supabase.exemplo.test/functions/v1/api-ros?pagina=2&situacao=Aprovada')
        self.assertEqual(capturado['authorization'], 'token-clickup')
        self.assertEqual(capturado['timeout'], 20)
        self.assertEqual(json.loads(resposta.getvalue()), {'data': []})


if __name__ == '__main__':
    unittest.main()
