import test from 'node:test';
import assert from 'node:assert/strict';
import { persistirAtividade } from '../supabase/functions/api-atividades/persistencia.ts';
test('falha no banco impede publicação no ClickUp', async()=>{
 let publicado=false;
 await assert.rejects(persistirAtividade({salvar:async()=>{throw Error('banco');},publicar:async()=>{publicado=true;return '77';},vincular:async()=>{}}),/banco/);
 assert.equal(publicado,false);
});
test('falha externa preserva atividade gravada e informa pendência', async()=>{
 const r=await persistirAtividade({salvar:async()=>({id:'local'}),publicar:async()=>{throw Error('timeout');},vincular:async()=>{}});
 assert.equal(r[0].id,'local'); assert.equal(r[0].sincronizacao,'pendente');
});
test('falha no vínculo não manda republicar comentário existente', async()=>{
 const r=await persistirAtividade({salvar:async()=>({id:'local'}),publicar:async()=> '77',vincular:async()=>{throw Error('banco');}});
 assert.equal(r[0].sincronizacao,'requer_conciliacao'); assert.equal(r[0].clickup_comment_id,'77');
});
test('sucesso exige confirmação de vínculo persistido', async()=>{
 let linked=false;
 const r=await persistirAtividade({salvar:async()=>({id:'local'}),publicar:async()=> '77',vincular:async()=>{linked=true;}});
 assert.equal(linked,true); assert.equal(r[0].sincronizacao,'sincronizado');
});
