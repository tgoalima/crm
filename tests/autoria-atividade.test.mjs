import test from 'node:test';
import assert from 'node:assert/strict';
import { validarAutor } from '../supabase/functions/api-atividades/autoria.ts';
test('usa identidade do ClickUp em vez de nome informado',async()=>{
 const r=await validarAutor('token-identidade','10',async()=>new Response(JSON.stringify({user:{id:10,username:'Nome real'}})));
 assert.equal(r.id,'10');assert.equal(r.nome,'Nome real');
});
test('sem token não consulta nem usa credencial global',async()=>{
 let chamado=false;
 await assert.rejects(validarAutor(null,null,async()=>{chamado=true;return new Response();}),e=>e.status===401);
 assert.equal(chamado,false);
});
test('autoria divergente é rejeitada',async()=>{
 await assert.rejects(validarAutor('token-divergente','99',async()=>new Response(JSON.stringify({user:{id:10,username:'Nome'}}))),e=>e.status===403);
});
test('token inválido e indisponibilidade não geram identidade presumida',async()=>{
 for(const status of [401,403,429,500]) await assert.rejects(validarAutor(`token-status-${status}`,null,async()=>new Response('{}',{status})),e=>e.status===(status<429?401:503));
 await assert.rejects(validarAutor('token-rede',null,async()=>{throw Error('rede');}),e=>e.status===503);
});
test('resposta sem identidade ou JSON inválido é indisponibilidade, não humano',async()=>{
 for(const [indice, body] of ['{}','{','{"user":{"id":"texto"}}'].entries()) {
  await assert.rejects(validarAutor(`token-resposta-${indice}`,null,async()=>new Response(body)),e=>e.status===503);
 }
});

test('requisições simultâneas com a mesma sessão reutilizam uma única validação no ClickUp', async () => {
 let chamadas = 0;
 const consultar = async () => {
  chamadas += 1;
  await new Promise((resolve) => setTimeout(resolve, 10));
  return new Response(JSON.stringify({ user: { id: 10, username: 'Nome real' } }));
 };
 const [primeira, segunda] = await Promise.all([
  validarAutor('token-cache-concorrente', null, consultar),
  validarAutor('token-cache-concorrente', null, consultar),
 ]);
 assert.equal(primeira.id, '10');
 assert.equal(segunda.id, '10');
 assert.equal(chamadas, 1);
 await validarAutor('token-cache-concorrente', null, consultar);
 assert.equal(chamadas, 1);
});
