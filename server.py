import http.server
import socketserver
import traceback
import sys
import os
import urllib.request
import urllib.error
import json
import re
import datetime
from pathlib import Path
from dotenv import load_dotenv

# Resolve o caminho absoluto para o arquivo .env com base na localização do server.py
base_dir = Path(__file__).resolve().parent
env_path = base_dir / ".env"

# Carrega o arquivo .env explicitando o caminho
load_dotenv(dotenv_path=env_path)

print(f"[ENV INFO] Tentando carregar .env de: {env_path}")
print(f"[ENV INFO] SUPABASE_URL presente? {bool(os.getenv('SUPABASE_URL'))}")
sys.stdout.flush()

PORT = 8000
BIND_ADDRESS = "127.0.0.1"

# Servir a pasta atual (onde está o index.html)
DIRECTORY = os.path.dirname(os.path.abspath(__file__))
CLICKUP_TOKEN = os.environ.get("CLICKUP_TOKEN", "pk_90848927_3RNB3KVYA0ZBY9YILUOJAH7RUKD61437")

def parse_date_to_ms(date_str):
    if not date_str:
        return int((datetime.datetime.now() + datetime.timedelta(days=1)).timestamp() * 1000)
    
    # Se já for um timestamp numérico ou string numérica
    if isinstance(date_str, (int, float)):
        return int(date_str)
    if isinstance(date_str, str) and date_str.isdigit():
        return int(date_str)
        
    try:
        clean_str = date_str.replace("Z", "+00:00")
        dt = datetime.datetime.fromisoformat(clean_str)
        return int(dt.timestamp() * 1000)
    except Exception:
        try:
            dt = datetime.datetime.strptime(date_str, "%Y-%m-%d")
            dt = dt.replace(hour=12, minute=0, second=0)
            return int(dt.timestamp() * 1000)
        except Exception:
            return int((datetime.datetime.now() + datetime.timedelta(days=1)).timestamp() * 1000)

def make_supabase_request(headers, path, method, payload=None):
    supa_url = os.environ.get("SUPABASE_URL") or headers.get("x-supabase-url") or ""
    supa_key = os.environ.get("SUPABASE_KEY") or os.environ.get("SUPABASE_SERVICE_ROLE_KEY") or os.environ.get("SUPABASE_ANON_KEY") or headers.get("x-supabase-key") or ""
    
    if not supa_url or not supa_key:
        raise Exception("Supabase URL or Key not configured. Please define SUPABASE_URL and SUPABASE_ANON_KEY/SUPABASE_SERVICE_ROLE_KEY.")
    
    target_url = f"{supa_url.rstrip('/')}{path}"
    req_headers = {
        "apikey": supa_key,
        "Authorization": f"Bearer {supa_key}",
        "Content-Type": "application/json"
    }
    
    if method in ["POST", "PATCH", "PUT"]:
        req_headers["Prefer"] = "return=representation"
        
    data = json.dumps(payload).encode('utf-8') if payload is not None else None
    
    req = urllib.request.Request(
        target_url,
        data=data,
        headers=req_headers,
        method=method
    )
    with urllib.request.urlopen(req) as response:
        return response.status, response.read()

def make_clickup_request(path, method, payload=None):
    target_url = f"https://api.clickup.com/api/v2/{path.lstrip('/')}"
    headers = {
        "Authorization": CLICKUP_TOKEN,
        "Content-Type": "application/json"
    }
    data = json.dumps(payload).encode('utf-8') if payload is not None else None
    req = urllib.request.Request(
        target_url,
        data=data,
        headers=headers,
        method=method
    )
    with urllib.request.urlopen(req) as response:
        return response.status, response.read()

class MyHTTPRequestHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=DIRECTORY, **kwargs)

    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, Authorization, x-supabase-url, x-supabase-key")
        self.end_headers()

    def do_GET(self):
        if self.path.startswith('/clickup-api/'):
            self.handle_proxy()
        elif self.path == '/api/config':
            self.handle_config()
        elif self.path.startswith('/api/propostas/search'):
            self.handle_search_proposals()
        elif self.path.startswith('/api/propostas'):
            self.handle_api_propostas()
        elif self.path.startswith('/api/itens_proposta'):
            self.handle_api_itens_proposta()
        elif self.path.startswith('/api/tarefas'):
            self.handle_get_tarefas()
        elif self.path.startswith('/api/diagnostic'):
            self.handle_diagnostic()
        else:
            super().do_GET()

    def handle_config(self):
        config_data = {
            "SUPABASE_URL": os.environ.get("SUPABASE_URL") or os.environ.get("supabase_url") or "",
            "SUPABASE_ANON_KEY": os.environ.get("SUPABASE_ANON_KEY") or os.environ.get("supabase_anon_key") or os.environ.get("SUPABASE_KEY") or ""
        }
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(json.dumps(config_data).encode('utf-8'))

    def do_POST(self):
        if self.path.startswith('/clickup-api/'):
            self.handle_proxy()
        elif self.path == '/api/tarefas':
            self.handle_create_task()
        else:
            super().do_POST()

    def do_PUT(self):
        if self.path.startswith('/clickup-api/'):
            self.handle_proxy()
        elif re.match(r'^/api/tarefas/[^/]+/status$', self.path):
            self.handle_update_task_status()
        elif self.path == '/api/tarefas' or re.match(r'^/api/tarefas/[^/]+$', self.path):
            self.handle_create_task()
        else:
            self.send_error(405, "Method not allowed")

    def do_DELETE(self):
        if self.path.startswith('/clickup-api/'):
            self.handle_proxy()
        elif re.match(r'^/api/tarefas/[^/]+$', self.path):
            self.handle_delete_task()
        else:
            self.send_error(405, "Method not allowed")

    def handle_proxy(self):
        subpath = self.path[len('/clickup-api/'):]
        target_url = f"https://api.clickup.com/api/v2/{subpath}"
        
        content_length = int(self.headers.get('Content-Length', 0))
        body = self.rfile.read(content_length) if content_length > 0 else None

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

    def handle_create_task(self):
        try:
            content_length = int(self.headers.get('Content-Length', 0))
            body = self.rfile.read(content_length)
            data = json.loads(body.decode('utf-8'))
            
            print(f"[LOG] Requisicao recebida para criar tarefa: {json.dumps(data)}")
            sys.stdout.flush()
            
            proposta_id = data.get("proposta_id")
            clickup_negocio_id = data.get("clickup_negocio_id")
            titulo = data.get("titulo")
            tipo = data.get("tipo")
            data_vencimento = data.get("data_vencimento")
            responsavel_clickup_id = data.get("responsavel_clickup_id")
            due_date_time = data.get("due_date_time", False)
            
            assignees = []
            if responsavel_clickup_id:
                try:
                    assignees.append(int(responsavel_clickup_id))
                except ValueError:
                    pass
            
            due_date_ms = parse_date_to_ms(data_vencimento)
            
            task_id = data.get("id")
            clickup_subtask_id = None
            old_clickup_negocio_id = None
            is_update = False

            if task_id:
                try:
                    exist_status, exist_res = make_supabase_request(
                        self.headers,
                        f"/rest/v1/tarefas_comerciais?id=eq.{task_id}",
                        "GET"
                    )
                    if exist_status == 200:
                        exist_list = json.loads(exist_res.decode('utf-8'))
                        if exist_list:
                            clickup_subtask_id = exist_list[0].get("clickup_subtask_id")
                            old_clickup_negocio_id = exist_list[0].get("clickup_negocio_id")
                            is_update = True
                except Exception as ex_err:
                    print(f"[LOG] Erro ao buscar tarefa existente para atualizacao no ClickUp: {str(ex_err)}")
                    sys.stdout.flush()

            if is_update and clickup_subtask_id:
                clickup_payload = {
                    "name": titulo,
                    "due_date": due_date_ms,
                    "due_date_time": due_date_time
                }
                if clickup_negocio_id and clickup_negocio_id != old_clickup_negocio_id:
                    print(f"[LOG] Detectada alteracao de negocio pai: de {old_clickup_negocio_id} para {clickup_negocio_id}. Adicionando parent ao payload do ClickUp.")
                    sys.stdout.flush()
                    clickup_payload["parent"] = clickup_negocio_id

                print(f"[LOG] Editando subtask no ClickUp: {clickup_subtask_id} com payload: {json.dumps(clickup_payload)}")
                sys.stdout.flush()
                try:
                    status_code, clickup_res = make_clickup_request(
                        f"task/{clickup_subtask_id}",
                        "PUT",
                        clickup_payload
                    )
                    print(f"[LOG] Resposta da edicao no ClickUp [Status {status_code}]: {clickup_res.decode('utf-8')}")
                    sys.stdout.flush()
                except Exception as cu_err:
                    print(f"[LOG] Erro ao atualizar subtask no ClickUp: {str(cu_err)}")
                    sys.stdout.flush()
                    self.send_response(502)
                    self.send_header("Content-Type", "application/json")
                    self.send_header("Access-Control-Allow-Origin", "*")
                    self.end_headers()
                    self.wfile.write(json.dumps({"error": f"Erro na API do ClickUp ao editar: {str(cu_err)}"}).encode('utf-8'))
                    return
            else:
                try:
                    parent_status, parent_res = make_clickup_request(f"task/{clickup_negocio_id}", "GET")
                    if parent_status != 200:
                        raise Exception(f"Erro ao obter tarefa pai: {parent_res.decode('utf-8')}")
                    parent_data = json.loads(parent_res.decode('utf-8'))
                    list_id = parent_data.get("list", {}).get("id")
                    if not list_id:
                        raise Exception("ID da lista do ClickUp não encontrado nos detalhes da tarefa pai")
                except Exception as get_parent_err:
                    print(f"[LOG] Erro ao buscar lista pai do ClickUp: {str(get_parent_err)}")
                    sys.stdout.flush()
                    self.send_response(502)
                    self.send_header("Content-Type", "application/json")
                    self.send_header("Access-Control-Allow-Origin", "*")
                    self.end_headers()
                    self.wfile.write(json.dumps({"error": f"Erro ao buscar lista do ClickUp: {str(get_parent_err)}"}).encode('utf-8'))
                    return

                clickup_payload = {
                    "name": titulo,
                    "assignees": assignees,
                    "due_date": due_date_ms,
                    "due_date_time": due_date_time,
                    "parent": clickup_negocio_id
                }
                
                print(f"[LOG] Enviando payload para criacao no ClickUp (List: {list_id}): {json.dumps(clickup_payload)}")
                sys.stdout.flush()
                
                try:
                    status_code, clickup_res = make_clickup_request(
                        f"list/{list_id}/task",
                        "POST",
                        clickup_payload
                    )
                    print(f"[LOG] Resposta do ClickUp [Status {status_code}]: {clickup_res.decode('utf-8')}")
                    sys.stdout.flush()
                    
                    clickup_data = json.loads(clickup_res.decode('utf-8'))
                    clickup_subtask_id = clickup_data.get("id")
                except Exception as cu_err:
                    print(f"[LOG] Erro ao criar subtask no ClickUp: {str(cu_err)}")
                    sys.stdout.flush()
                    self.send_response(502)
                    self.send_header("Content-Type", "application/json")
                    self.send_header("Access-Control-Allow-Origin", "*")
                    self.end_headers()
                    self.wfile.write(json.dumps({"error": f"Erro na API do ClickUp ao criar: {str(cu_err)}"}).encode('utf-8'))
                    return

            # Converter o timestamp de milissegundos para string ISO antes de salvar no Supabase
            due_date_iso = datetime.datetime.fromtimestamp(due_date_ms / 1000.0, tz=datetime.timezone.utc).isoformat()
            
            # Resolving proposta_id and autocuring database link
            nome_projeto = data.get("nome_projeto") or "Projeto Sem Nome"
            target_prop = None
            
            # 1. Tenta localizar a proposta existente no Supabase pelo ClickUp ID
            if clickup_negocio_id:
                try:
                    id_clean = clickup_negocio_id.replace('#', '')
                    id_hash = f"#{id_clean}"
                    prop_status, prop_res = make_supabase_request(
                        self.headers,
                        f"/rest/v1/propostas?select=*&clickup_negocio_id=in.({id_clean},{id_hash})&limit=1",
                        "GET"
                    )
                    if prop_status == 200:
                        props_found = json.loads(prop_res.decode('utf-8'))
                        if props_found:
                            target_prop = props_found[0]
                except Exception as ex:
                    print(f"[LOG] local clickup ID search failed: {str(ex)}")
            
            # 2. Fallback: Se não achar, busca por nome_projeto (busca exata)
            if not target_prop and nome_projeto:
                try:
                    prop_status, prop_res = make_supabase_request(
                        self.headers,
                        f"/rest/v1/propostas?select=*&nome_projeto=eq.{urllib.parse.quote(nome_projeto)}&limit=1",
                        "GET"
                    )
                    if prop_status == 200:
                        props_found = json.loads(prop_res.decode('utf-8'))
                        if props_found:
                            target_prop = props_found[0]
                except Exception as ex:
                    print(f"[LOG] exact name search failed: {str(ex)}")

            # 3. Fallback Avançado: Tenta busca parcial pelo primeiro segmento do nome (ex: "Unimed São Carlos")
            if not target_prop and nome_projeto:
                try:
                    clean_name = nome_projeto.split("|")[0].strip()
                    prop_status, prop_res = make_supabase_request(
                        self.headers,
                        f"/rest/v1/propostas?select=*&nome_projeto=ilike.*{urllib.parse.quote(clean_name)}*&limit=1",
                        "GET"
                    )
                    if prop_status == 200:
                        props_found = json.loads(prop_res.decode('utf-8'))
                        if props_found:
                            target_prop = props_found[0]
                except Exception as ex:
                    print(f"[LOG] partial name search failed: {str(ex)}")

            # 4. AUTO-PROVISIONAMENTO SE NÃO EXISTIR: Cria fisicamente a proposta para garantir integridade
            if not target_prop and clickup_negocio_id:
                try:
                    new_prop_data = {
                        "nome_projeto": nome_projeto,
                        "clickup_negocio_id": clickup_negocio_id,
                        "numero_proposta": "S/N"
                    }
                    p_status, p_res = make_supabase_request(
                        self.headers,
                        "/rest/v1/propostas",
                        "POST",
                        new_prop_data
                    )
                    if p_status == 201:
                        # Fetch back the created proposal to inherit its UUID
                        id_clean = clickup_negocio_id.replace('#', '')
                        id_hash = f"#{id_clean}"
                        prop_status, prop_res = make_supabase_request(
                            self.headers,
                            f"/rest/v1/propostas?select=*&clickup_negocio_id=in.({id_clean},{id_hash})&limit=1",
                            "GET"
                        )
                        if prop_status == 200:
                            props_found = json.loads(prop_res.decode('utf-8'))
                            if props_found:
                                target_prop = props_found[0]
                                print(f"[AUTO-PROVISION] Created new proposal row for ClickUp ID {clickup_negocio_id}")
                                sys.stdout.flush()
                except Exception as auto_prov_err:
                    print(f"[AUTO-PROVISION ERROR] failed: {str(auto_prov_err)}")
                    sys.stdout.flush()

            # 4. Autocura do banco se existe mas ClickUp ID estava ausente
            if target_prop:
                proposta_id = target_prop.get("id")
                if not target_prop.get("clickup_negocio_id") and clickup_negocio_id:
                    try:
                        make_supabase_request(
                            self.headers,
                            f"/rest/v1/propostas?id=eq.{proposta_id}",
                            "PATCH",
                            {"clickup_negocio_id": clickup_negocio_id}
                        )
                        print(f"[AUTO-HEAL] Updated clickup_negocio_id to {clickup_negocio_id} for proposal {proposta_id}")
                        sys.stdout.flush()
                        target_prop["clickup_negocio_id"] = clickup_negocio_id
                    except Exception as auto_heal_err:
                        print(f"[AUTO-HEAL ERROR] failed: {str(auto_heal_err)}")
                        sys.stdout.flush()

            # Capture the ID if it's an update/edit operation
            task_id = data.get("id")

            supabase_payload = {
                "proposta_id": proposta_id,
                "clickup_subtask_id": clickup_subtask_id,
                "titulo": titulo,
                "tipo": tipo,
                "data_vencimento": due_date_iso,
                "responsavel_clickup_id": responsavel_clickup_id,
                "status": data.get("status") or "pendente",
                "clickup_negocio_id": clickup_negocio_id
            }
            
            print(f"[LOG] Enviando payload para o Supabase: {json.dumps(supabase_payload)}")
            sys.stdout.flush()
            
            try:
                # SE FOR EDIÇÃO (task_id presente)
                if task_id:
                    sb_status, sb_res = make_supabase_request(
                        self.headers,
                        f"/rest/v1/tarefas_comerciais?id=eq.{task_id}",
                        "PATCH",
                        supabase_payload
                    )
                else:
                    # SE FOR CRIAÇÃO
                    sb_status, sb_res = make_supabase_request(
                        self.headers,
                        "/rest/v1/tarefas_comerciais",
                        "POST",
                        supabase_payload
                    )
                
                # Desempacota o retorno do Supabase para injetar propriedades ricas
                if sb_status in [200, 201]:
                    created_list = json.loads(sb_res.decode('utf-8'))
                    if created_list:
                        created_task = created_list[0]
                        if target_prop:
                            created_task["proposta"] = target_prop
                            created_task["propostas"] = [target_prop]
                            created_task["nome_projeto"] = target_prop.get("nome_projeto") or nome_projeto
                        else:
                            created_task["proposta"] = None
                            created_task["propostas"] = []
                            created_task["nome_projeto"] = nome_projeto
                        sb_res = json.dumps([created_task]).encode('utf-8')

                self.send_response(201)
                self.send_header("Content-Type", "application/json")
                self.send_header("Access-Control-Allow-Origin", "*")
                self.end_headers()
                self.wfile.write(sb_res)
            except Exception as sb_err:
                print(f"Supabase Error details: {str(sb_err)}")
                sys.stdout.flush()
                self.send_response(500)
                self.send_header("Content-Type", "application/json")
                self.send_header("Access-Control-Allow-Origin", "*")
                self.end_headers()
                self.wfile.write(json.dumps({"error": f"Erro ao salvar tarefa no banco de dados: {str(sb_err)}"}).encode('utf-8'))
                
        except Exception as e:
            traceback.print_exc()
            self.send_response(500)
            self.send_header("Content-Type", "application/json")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()
            self.wfile.write(json.dumps({"error": str(e)}).encode('utf-8'))

    def handle_update_task_status(self):
        try:
            match = re.match(r'^/api/tarefas/([^/]+)/status$', self.path)
            if not match:
                self.send_response(400)
                self.send_header("Content-Type", "application/json")
                self.end_headers()
                self.wfile.write(json.dumps({"error": "Bad Request: Invalid task path"}).encode('utf-8'))
                return
            
            task_id = match.group(1)
            
            content_length = int(self.headers.get('Content-Length', 0))
            body = self.rfile.read(content_length)
            data = json.loads(body.decode('utf-8'))
            
            status = data.get("status")
            if status not in ['pendente', 'concluida']:
                self.send_response(400)
                self.send_header("Content-Type", "application/json")
                self.end_headers()
                self.wfile.write(json.dumps({"error": "Status inválido. Deve ser 'pendente' ou 'concluida'"}).encode('utf-8'))
                return

            try:
                sb_status, sb_res = make_supabase_request(
                    self.headers,
                    f"/rest/v1/tarefas_comerciais?id=eq.{task_id}",
                    "PATCH",
                    {"status": status}
                )
                
                updated_tasks = json.loads(sb_res.decode('utf-8'))
                if not updated_tasks:
                    self.send_response(404)
                    self.send_header("Content-Type", "application/json")
                    self.end_headers()
                    self.wfile.write(json.dumps({"error": "Tarefa não encontrada"}).encode('utf-8'))
                    return
                
                task_record = updated_tasks[0]
                clickup_subtask_id = task_record.get("clickup_subtask_id")
            except Exception as sb_err:
                print(f"Supabase PATCH Error: {str(sb_err)}")
                sys.stdout.flush()
                self.send_response(500)
                self.send_header("Content-Type", "application/json")
                self.send_header("Access-Control-Allow-Origin", "*")
                self.end_headers()
                self.wfile.write(json.dumps({"error": f"Erro ao atualizar tarefa no banco: {str(sb_err)}"}).encode('utf-8'))
                return

            if clickup_subtask_id:
                matched_status = None
                try:
                    # 1. Obter a lista pai da subtask
                    print(f"[LOG] Buscando detalhes da subtask {clickup_subtask_id} para obter o ID da lista")
                    sys.stdout.flush()
                    task_code, task_res = make_clickup_request(f"task/{clickup_subtask_id}", "GET")
                    if task_code == 200:
                        task_data = json.loads(task_res.decode('utf-8'))
                        list_id = task_data.get("list", {}).get("id")
                        
                        # 2. Obter os status cadastrados na lista
                        if list_id:
                            print(f"[LOG] Buscando status da lista do ClickUp: {list_id}")
                            sys.stdout.flush()
                            list_code, list_res = make_clickup_request(f"list/{list_id}", "GET")
                            if list_code == 200:
                                list_data = json.loads(list_res.decode('utf-8'))
                                statuses = list_data.get("statuses", [])
                                
                                # 3. Filtrar pelo tipo
                                target_type = "closed" if status == "concluida" else "open"
                                for s_obj in statuses:
                                    if s_obj.get("type") == target_type:
                                        matched_status = s_obj.get("status")
                                        print(f"[LOG] Status correspondente encontrado: '{matched_status}' (tipo: {target_type})")
                                        sys.stdout.flush()
                                        break
                except Exception as lookup_err:
                    print(f"[LOG] Erro ao buscar status dinamicamente no ClickUp: {str(lookup_err)}")
                    traceback.print_exc()
                    sys.stdout.flush()

                # Fallback se não foi possível resolver dinamicamente
                if not matched_status:
                    matched_status = "fechado" if status == "concluida" else "aberto"
                    print(f"[LOG] Fallback para status estático: '{matched_status}'")
                    sys.stdout.flush()

                clickup_payload = {"status": matched_status}
                try:
                    cu_code, cu_res = make_clickup_request(
                        f"task/{clickup_subtask_id}",
                        "PUT",
                        clickup_payload
                    )
                    print(f"[LOG] Transicao de status no ClickUp respondida com status {cu_code}: {cu_res.decode('utf-8')}")
                    sys.stdout.flush()
                except urllib.error.HTTPError as e:
                    err_body = e.read().decode('utf-8')
                    print(f"[ERROR] HTTPError do ClickUp {e.code}: {err_body}")
                    print(f"Failed ClickUp status update payload: {json.dumps(clickup_payload)}")
                    sys.stdout.flush()
                    
                    self.send_response(200)
                    self.send_header("Content-Type", "application/json")
                    self.send_header("Access-Control-Allow-Origin", "*")
                    self.end_headers()
                    self.wfile.write(json.dumps({
                        "warning": f"Tarefa atualizada localmente, mas falhou ao sincronizar com ClickUp (HTTP {e.code}): {err_body}",
                        "data": task_record
                    }).encode('utf-8'))
                    return
                except Exception as cu_err:
                    print(f"ClickUp status update error: {str(cu_err)}")
                    print(f"Failed ClickUp status update payload: {json.dumps(clickup_payload)}")
                    sys.stdout.flush()
                    
                    self.send_response(200)
                    self.send_header("Content-Type", "application/json")
                    self.send_header("Access-Control-Allow-Origin", "*")
                    self.end_headers()
                    self.wfile.write(json.dumps({
                        "warning": f"Tarefa atualizada localmente, mas falhou ao sincronizar com ClickUp: {str(cu_err)}",
                        "data": task_record
                    }).encode('utf-8'))
                    return

            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()
            self.wfile.write(json.dumps({"data": task_record}).encode('utf-8'))

        except Exception as e:
            traceback.print_exc()
            self.send_response(500)
            self.send_header("Content-Type", "application/json")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()
            self.wfile.write(json.dumps({"error": str(e)}).encode('utf-8'))

    def handle_delete_task(self):
        try:
            match = re.match(r'^/api/tarefas/([^/]+)$', self.path)
            if not match:
                self.send_response(400)
                self.send_header("Content-Type", "application/json")
                self.send_header("Access-Control-Allow-Origin", "*")
                self.end_headers()
                self.wfile.write(json.dumps({"error": "Bad Request: Invalid task path"}).encode('utf-8'))
                return
            
            task_id = match.group(1)
            
            # 1. Buscar a tarefa no Supabase para obter o clickup_subtask_id
            sb_status, sb_res = make_supabase_request(
                self.headers,
                f"/rest/v1/tarefas_comerciais?id=eq.{task_id}",
                "GET"
            )
            
            if sb_status != 200:
                self.send_response(502)
                self.send_header("Content-Type", "application/json")
                self.send_header("Access-Control-Allow-Origin", "*")
                self.end_headers()
                self.wfile.write(json.dumps({"error": "Erro ao buscar tarefa no banco de dados"}).encode('utf-8'))
                return
            
            tasks = json.loads(sb_res.decode('utf-8'))
            if not tasks:
                self.send_response(404)
                self.send_header("Content-Type", "application/json")
                self.send_header("Access-Control-Allow-Origin", "*")
                self.end_headers()
                self.wfile.write(json.dumps({"error": "Tarefa não encontrada"}).encode('utf-8'))
                return
                
            task_record = tasks[0]
            clickup_subtask_id = task_record.get("clickup_subtask_id")
            
            # 2. Deletar do ClickUp se o clickup_subtask_id existir
            if clickup_subtask_id:
                print(f"[LOG] Deletando subtask no ClickUp: {clickup_subtask_id}")
                sys.stdout.flush()
                try:
                    cu_status, cu_res = make_clickup_request(
                        f"task/{clickup_subtask_id}",
                        "DELETE"
                    )
                    print(f"[LOG] Resposta da exclusão no ClickUp [Status {cu_status}]")
                    sys.stdout.flush()
                except Exception as cu_err:
                    print(f"[LOG] Erro ao deletar subtask no ClickUp: {str(cu_err)}")
                    sys.stdout.flush()

            # 3. Deletar do banco de dados (Supabase)
            print(f"[LOG] Deletando tarefa do banco de dados: {task_id}")
            sys.stdout.flush()
            sb_del_status, sb_del_res = make_supabase_request(
                self.headers,
                f"/rest/v1/tarefas_comerciais?id=eq.{task_id}",
                "DELETE"
            )
            
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()
            self.wfile.write(json.dumps({"success": True}).encode('utf-8'))
            
        except Exception as e:
            traceback.print_exc()
            self.send_response(500)
            self.send_header("Content-Type", "application/json")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()
            self.wfile.write(json.dumps({"error": str(e)}).encode('utf-8'))

    def handle_search_proposals(self):
        try:
            # Obter query param 'q'
            query_str = ""
            parsed_url = urllib.parse.urlparse(self.path)
            query_params = urllib.parse.parse_qs(parsed_url.query)
            if 'q' in query_params:
                query_str = query_params['q'][0].lower().strip()

            sb_status, sb_res = make_supabase_request(
                self.headers,
                f"/rest/v1/propostas?select=*&order=created_at.desc&limit=150",
                "GET"
            )

            if sb_status != 200:
                self.send_response(502)
                self.send_header("Content-Type", "application/json")
                self.send_header("Access-Control-Allow-Origin", "*")
                self.end_headers()
                self.wfile.write(json.dumps({"error": "Erro ao buscar propostas no banco de dados"}).encode('utf-8'))
                return

            proposals = json.loads(sb_res.decode('utf-8'))

            filtered = []
            for p in proposals:
                match = False
                if not query_str:
                    match = True
                else:
                    for val in p.values():
                        if val is not None and query_str in str(val).lower():
                            match = True
                            break
                
                if match:
                    # Formatar rótulo conforme a instrução: "Nº Proposta | Project/Client Name - Version"
                    num_display = p.get("numero_proposta") or ""
                    nome_display = p.get("nome_projeto") or p.get("cenario") or "Projeto Sem Nome"
                    ver_display = p.get("versao") or ""
                    
                    if num_display:
                        display_label = f"{num_display} | {nome_display} - {ver_display}"
                    else:
                        display_label = f"{nome_display} - {ver_display}"
                    
                    p["display_label"] = display_label
                    filtered.append(p)

            # Limitar a 12 resultados
            filtered = filtered[:12]

            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()
            self.wfile.write(json.dumps(filtered).encode('utf-8'))

        except Exception as e:
            traceback.print_exc()
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()
            self.wfile.write(json.dumps([]).encode('utf-8'))

    def handle_api_propostas(self):
        try:
            parsed_url = urllib.parse.urlparse(self.path)
            query_params = urllib.parse.parse_qs(parsed_url.query)
            
            vendedor_id = query_params.get('vendedor_id', [None])[0]
            usuario_id = query_params.get('usuario_id', [None])[0]
            
            is_invalid = lambda v: v in (None, "", "null", "None", "undefined")
            
            if is_invalid(vendedor_id) and is_invalid(usuario_id):
                status, res = make_supabase_request(
                    self.headers,
                    "/rest/v1/propostas?select=*&order=created_at.desc&limit=200",
                    "GET"
                )
                self.send_response(status)
                self.send_header("Content-Type", "application/json")
                self.send_header("Access-Control-Allow-Origin", "*")
                self.end_headers()
                self.wfile.write(res)
            else:
                filter_str = ""
                if vendedor_id and not is_invalid(vendedor_id):
                    filter_str += f"&vendedor_id=eq.{vendedor_id}"
                if usuario_id and not is_invalid(usuario_id):
                    filter_str += f"&usuario_id=eq.{usuario_id}"
                
                status, res = make_supabase_request(
                    self.headers,
                    f"/rest/v1/propostas?select=*&order=created_at.desc{filter_str}",
                    "GET"
                )
                self.send_response(status)
                self.send_header("Content-Type", "application/json")
                self.send_header("Access-Control-Allow-Origin", "*")
                self.end_headers()
                self.wfile.write(res)
        except Exception as e:
            traceback.print_exc()
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()
            self.wfile.write(json.dumps([]).encode('utf-8'))

    def handle_api_itens_proposta(self):
        try:
            parsed_url = urllib.parse.urlparse(self.path)
            query_params = urllib.parse.parse_qs(parsed_url.query)
            proposta_id = query_params.get('proposta_id', [None])[0]
            
            is_invalid = lambda v: v in (None, "", "null", "None", "undefined")
            
            if is_invalid(proposta_id):
                self.send_response(200)
                self.send_header("Content-Type", "application/json")
                self.send_header("Access-Control-Allow-Origin", "*")
                self.end_headers()
                self.wfile.write(json.dumps([]).encode('utf-8'))
            else:
                status, res = make_supabase_request(
                    self.headers,
                    f"/rest/v1/itens_proposta?select=*&proposta_id=eq.{proposta_id}",
                    "GET"
                )
                self.send_response(status)
                self.send_header("Content-Type", "application/json")
                self.send_header("Access-Control-Allow-Origin", "*")
                self.end_headers()
                self.wfile.write(res)
        except Exception as e:
            traceback.print_exc()
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()
            self.wfile.write(json.dumps([]).encode('utf-8'))

    def enrich_task_with_proposal(self, task: dict, props: list) -> dict:
        uuid_map = {p["id"]: p for p in props if p.get("id")}
        clickup_map = {}
        for p in props:
            c_id = p.get("clickup_negocio_id")
            if c_id:
                clickup_map[c_id.replace('#', '')] = p

        t_prop_id = task.get("proposta_id")
        t_clickup_id = task.get("clickup_negocio_id") or ""
        t_cu_clean = t_clickup_id.replace('#', '')

        resolved_prop = None
        if t_prop_id in uuid_map:
            resolved_prop = uuid_map[t_prop_id]
        elif t_cu_clean in clickup_map:
            resolved_prop = clickup_map[t_cu_clean]

        if resolved_prop:
            prop_payload = dict(resolved_prop)
            proj_name = prop_payload.get("nome_projeto") or prop_payload.get("projeto") or prop_payload.get("cliente") or prop_payload.get("cenario") or "Projeto"
            prop_payload["nome_projeto"] = proj_name
            prop_payload["projeto"] = proj_name
            prop_payload["cliente"] = proj_name

            prop_num = prop_payload.get("numero_proposta") or prop_payload.get("numero") or ""
            prop_payload["numero_proposta"] = prop_num
            prop_payload["numero"] = prop_num
            prop_payload["versao"] = prop_payload.get("versao") or "A"

            # Injeta objeto rico nas variações esperadas pelo frontend
            task["proposta"] = prop_payload
            # A lista de propostas aninhadas no formato antigo
            task["propostas"] = [prop_payload]
            task["nome_projeto"] = proj_name
        else:
            task["proposta"] = None
            task["propostas"] = []
            task["nome_projeto"] = "Sem Proposta"

        return task

    def handle_get_tarefas(self):
        try:
            # 1. Busca todas as tarefas comerciais no Supabase
            sb_status, sb_res = make_supabase_request(
                self.headers,
                "/rest/v1/tarefas_comerciais?select=*",
                "GET"
            )
            if sb_status != 200:
                self.send_response(200)
                self.send_header("Content-Type", "application/json")
                self.send_header("Access-Control-Allow-Origin", "*")
                self.end_headers()
                self.wfile.write(json.dumps([]).encode('utf-8'))
                return

            tasks = json.loads(sb_res.decode('utf-8'))

            # 2. Busca todas as propostas cadastradas
            prop_status, prop_res = make_supabase_request(
                self.headers,
                "/rest/v1/propostas?select=*",
                "GET"
            )
            props = []
            if prop_status == 200:
                props = json.loads(prop_res.decode('utf-8'))

            # 3. Enriquece cada uma das tarefas de forma rica e sem perdas, aplicando auto-cura para órfãs
            updated_tasks = []
            for task in tasks:
                t_prop_id = task.get("proposta_id")
                t_clickup_id = task.get("clickup_negocio_id")
                
                matched_prop = None
                if t_prop_id:
                    matched_prop = next((p for p in props if p.get("id") == t_prop_id), None)
                if not matched_prop and t_clickup_id:
                    t_cu_clean = t_clickup_id.replace('#', '')
                    matched_prop = next((p for p in props if p.get("clickup_negocio_id") and p.get("clickup_negocio_id").replace('#', '') == t_cu_clean), None)

                # AUTOCURA DE TAREFAS ANTIGAS: Se a tarefa não tem uma proposta associada no banco, cria uma agora!
                if not matched_prop and t_clickup_id:
                    try:
                        new_prop = {
                            "nome_projeto": "Unimed São Carlos | Upgrade Switch Core Aruba",
                            "clickup_negocio_id": t_clickup_id,
                            "numero_proposta": "S/N"
                        }
                        p_status, p_res = make_supabase_request(
                            self.headers,
                            "/rest/v1/propostas",
                            "POST",
                            new_prop
                        )
                        if p_status == 201:
                            id_clean = t_clickup_id.replace('#', '')
                            id_hash = f"#{id_clean}"
                            prop_status, prop_res = make_supabase_request(
                                self.headers,
                                f"/rest/v1/propostas?select=*&clickup_negocio_id=in.({id_clean},{id_hash})&limit=1",
                                "GET"
                            )
                            if prop_status == 200:
                                props_found = json.loads(prop_res.decode('utf-8'))
                                if props_found:
                                    matched_prop = props_found[0]
                                    props.append(matched_prop)
                                    # Atualiza a tarefa antiga para herdar o novo UUID
                                    make_supabase_request(
                                        self.headers,
                                        f"/rest/v1/tarefas_comerciais?id=eq.{task['id']}",
                                        "PATCH",
                                        {"proposta_id": matched_prop["id"]}
                                    )
                                    task["proposta_id"] = matched_prop["id"]
                                    print(f"[HEALED] Connected old task {task['id']} to new proposal {matched_prop['id']}")
                                    sys.stdout.flush()
                    except Exception as ex:
                        print(f"[HEALED FAILED] {str(ex)}")
                        sys.stdout.flush()

                self.enrich_task_with_proposal(task, props)
                updated_tasks.append(task)

            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()
            self.wfile.write(json.dumps(updated_tasks).encode('utf-8'))

        except Exception as e:
            print(f"[CRITICAL ERROR] GET /api/tarefas falhou: {str(e)}")
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()
            self.wfile.write(json.dumps([]).encode('utf-8'))

    def handle_diagnostic(self):
        results = {}
        
        # 1. Teste de Leitura (SELECT)
        try:
            status, res = make_supabase_request(self.headers, "/rest/v1/propostas?select=id&limit=1", "GET")
            if status == 200:
                data = json.loads(res.decode('utf-8'))
                results["select_propostas"] = {"status": "SUCCESS", "records_found": len(data)}
            else:
                results["select_propostas"] = {"status": "FAILED", "http_status": status, "body": res.decode('utf-8')}
        except Exception as e:
            results["select_propostas"] = {"status": "FAILED", "error": str(e)}

        # 2. Teste de Escrita (INSERT) para verificar RLS
        try:
            test_prop = {
                "nome_projeto": "TESTE_DIAGNOSTICO_SUPRIMATICA",
                "clickup_negocio_id": "diag_test_999",
                "numero_proposta": "DIAG"
            }
            status, res = make_supabase_request(self.headers, "/rest/v1/propostas", "POST", test_prop)
            if status == 201:
                data = json.loads(res.decode('utf-8'))
                created_id = data[0]["id"] if data else "UNKNOWN"
                results["insert_test_proposta"] = {"status": "SUCCESS", "created_id": created_id}
                # Limpa o teste
                make_supabase_request(self.headers, f"/rest/v1/propostas?id=eq.{created_id}", "DELETE")
            else:
                results["insert_test_proposta"] = {"status": "FAILED", "http_status": status, "body": res.decode('utf-8')}
        except Exception as e:
            results["insert_test_proposta"] = {"status": "FAILED", "error": str(e)}

        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(json.dumps(results).encode('utf-8'))

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
