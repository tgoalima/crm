import test from 'node:test';
import assert from 'node:assert/strict';
import { coletarComentariosClickUp } from '../supabase/functions/mcp-brain/comentarios.ts';
import { coletarEvidenciasHumanas } from '../supabase/functions/mcp-brain/evidencias-humanas.ts';
const comment=(id,user='10')=>({id,date:'1789128000000',comment_text:'Cliente aguarda orçamento',user:{id:user,username:'Autor'}});
test('busca próxima página pelo par data e ID mesmo após página curta',async()=>{
 let n=0;
 const r=await coletarComentariosClickUp(async(cursor)=>{
  n++;
  if(n===1){assert.equal(cursor,undefined);return {comments:[comment('1')]};}
  assert.deepEqual(cursor,{start:'1789128000000',start_id:'1'});return {comments:[]};
 });
 assert.equal(r.completa,true);assert.equal(r.atividades[0].autor_clickup_id,'10');
});
test('erro remoto não é reportado como histórico vazio completo',async()=>{
 const r=await coletarComentariosClickUp(async()=>{throw Error('rede');});
 assert.equal(r.completa,false);assert.equal(r.motivo,'falha_consulta');
});
test('cursor repetido interrompe laço e sinaliza cobertura',async()=>{
 const r=await coletarComentariosClickUp(async()=>({comments:[comment('1')]}));
 assert.equal(r.completa,false);assert.equal(r.motivo,'cursor_repetido');
});
test('combina fontes antes do limite, elimina agente e deduplica cópia',async()=>{
 const r=await coletarEvidenciasHumanas(async()=>[{id:'local',clickup_comment_id:'1',autor_clickup_id:'10',data_execucao:'2026-09-11',texto:'original'}],{'10':'humano','-20':'agente'},50,async()=>({atividades:[{id:'cu_1',clickup_comment_id:'1',autor_clickup_id:'10',data_execucao:'2026-09-11',texto:'cópia'},{id:'cu_2',clickup_comment_id:'2',autor_clickup_id:'-20',data_execucao:'2026-09-12',texto:'automático'}],completa:true,motivo:null}));
 assert.equal(r.evidencias.length,1);assert.equal(r.evidencias[0].texto,'original');assert.equal(r.excluidas.agente,1);assert.equal(r.cobertura_clickup_completa,true);
});
test('dados malformados não viram consulta completa nem anexo interpretado',async()=>{
 for(const payload of [null,{}, {comments:[{id:'1',date:'invalida'}]}]) {
  const r=await coletarComentariosClickUp(async()=>payload);
  assert.equal(r.completa,false);
 }
 let n=0;
 const r=await coletarComentariosClickUp(async()=>({comments:n++?[]:[comment('1')]}));
 assert.equal(r.atividades[0].anexos_verificados,false);
});
test('limite de páginas não afirma cobertura completa',async()=>{
 let n=0;
 const r=await coletarComentariosClickUp(async()=>({comments:[comment(String(++n))]}));
 assert.equal(n,100);assert.equal(r.completa,false);assert.equal(r.motivo,'limite_paginas');
});
