import contextlib
import ast
import datetime
import io
import re
import json
import sys
import traceback
import unittest
from pathlib import Path
from types import SimpleNamespace

class PersistenciaTest(unittest.TestCase):
    def executar(self, falha_banco=False, falha_clickup=False, auth_status=200, autor="10", token="test"):
        tree=ast.parse(Path('server.py').read_text())
        cls=next(n for n in tree.body if isinstance(n,ast.ClassDef) and n.name=='MyHTTPRequestHandler')
        method=next(n for n in cls.body if isinstance(n,ast.FunctionDef) and n.name=='handle_create_atividade')
        calls=[]
        def banco(headers,path,verb,payload):
            calls.append(('banco',verb,payload))
            if falha_banco:return 500,b'{}'
            return 201,json.dumps([{**payload,'id':'local'}]).encode()
        def clickup(*args,**kwargs):
            if args[0] == 'user':
                return auth_status,json.dumps({'user':{'id':10,'username':'Nome confirmado'}}).encode()
            calls.append(('clickup',))
            if falha_clickup:return 503,b'{}'
            return 200,b'{"id":"77"}'
        ns=dict(re=re,json=json,datetime=datetime,sys=sys,traceback=traceback,make_supabase_request=banco,make_clickup_request=clickup,build_clickup_comment_segments=lambda x:[{'text':x}])
        exec(compile(ast.Module(body=[method],type_ignores=[]),'server.py','exec'),ns)
        body=json.dumps({'clickup_negocio_id':'abc','texto':'status','autor_clickup_id':autor,'autor_nome':'Humano','origem':'tarefa','anexos':[{'url':'print'}]}).encode()
        status=[]
        h=SimpleNamespace(headers={'Content-Length':str(len(body)), 'Authorization':token},rfile=io.BytesIO(body),wfile=io.BytesIO(),get_client_token=lambda:'test',send_response=status.append,send_header=lambda *a:None,end_headers=lambda:None)
        with contextlib.redirect_stdout(io.StringIO()), contextlib.redirect_stderr(io.StringIO()):
            ns['handle_create_atividade'](h)
        return status[-1],json.loads(h.wfile.getvalue()),calls
    def test_falha_banco_nao_publica(self):
        status,body,calls=self.executar(falha_banco=True)
        self.assertEqual(status,500)
        self.assertFalse(any(c[0]=='clickup' for c in calls))
    def test_clickup_indisponivel_preserva_metadados(self):
        status,body,calls=self.executar(falha_clickup=True)
        self.assertEqual(status,201)
        self.assertEqual(body[0]['sincronizacao'],'pendente')
        self.assertEqual(body[0]['autor_clickup_id'],'10')
        self.assertEqual(body[0]['anexos'],[{'url':'print'}])
    def test_salva_antes_de_publicar_e_vincula(self):
        status,body,calls=self.executar()
        self.assertEqual([c[0] for c in calls],['banco','clickup','banco'])
        self.assertEqual(body[0]['sincronizacao'],'sincronizado')
    def test_autoria_confirmada(self):
        status,body,calls=self.executar()
        self.assertEqual(body[0]['autor_nome'],'Nome confirmado')
    def test_rejeita_identidade_antes_de_gravar(self):
        for kwargs,esperado in [({'token':''},401),({'autor':'99'},403),({'auth_status':401},401),({'auth_status':503},503)]:
            status,body,calls=self.executar(**kwargs)
            self.assertEqual(status,esperado)
            self.assertEqual(calls,[])
if __name__=='__main__':unittest.main()
