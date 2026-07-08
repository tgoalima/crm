  const syncClickUpProposta = async (taskId, valorTotal, flowName) => {
    const cleanTaskId = String(taskId).replace('#', '').trim();
    if (!cleanTaskId) return;

    const valorLimpo = parseNumericValue(valorTotal);
    const valorCentavos = Math.round(Number(valorLimpo) * 100);

    if (valorLimpo === null || valorLimpo === undefined || isNaN(Number(valorLimpo)) || Number(valorLimpo) <= 0 || isNaN(valorCentavos)) {
      console.warn(`[${new Date().toISOString()}] Ignorando sincronização com ClickUp (${flowName}) para tarefa ${cleanTaskId} pois o valor é inválido ou <= 0:`, valorLimpo);
      return;
    }

    try {
      // 1. Obter detalhes da tarefa atual (Proposta)
      const taskRes = await fetch(`https://api.clickup.com/api/v2/task/${cleanTaskId}`, {
        headers: {
          "Authorization": API_KEY,
          "Content-Type": "application/json"
        }
      });
      if (!taskRes.ok) {
        console.error(`[${new Date().toISOString()}] Erro ao obter tarefa ${cleanTaskId} no ClickUp (status: ${taskRes.status})`);
        return;
      }
      const currentTask = await taskRes.json();

      if (!currentTask || !currentTask.custom_fields) {
        console.warn(`[${new Date().toISOString()}] Tarefa ClickUp ${cleanTaskId} não tem custom_fields.`);
        return;
      }

      // a) Atualização local do "Total da Proposta" na tarefa de Proposta
      const campoValor = currentTask.custom_fields.find(f => {
        const name = (f.name || "").toLowerCase();
        return name === 'deal value' || 
               name === 'total da proposta' || 
               name === 'valor total' || 
               name === 'valor do negócio' || 
               name === 'valor' || 
               name === 'total';
      });

      if (campoValor) {
        const bodyCentavos = { value: valorCentavos };
        const urlValue = `https://api.clickup.com/api/v2/task/${cleanTaskId}/field/${campoValor.id}`;
        
        console.log(`[${new Date().toISOString()}] POST ${urlValue} - Body:`, JSON.stringify(bodyCentavos));
        
        if (cleanTaskId === '86ahby7wm') {
          console.log(`[${new Date().toISOString()}] [DETECTOR TASK 86ahby7wm] Enviando valor local para ClickUp (${flowName}): ${bodyCentavos.value}`);
        }

        const resVal = await fetch(urlValue, {
          method: 'POST',
          headers: {
            "Authorization": API_KEY,
            "Content-Type": "application/json"
          },
          body: JSON.stringify(bodyCentavos)
        });

        if (resVal.status !== 200 && resVal.status !== 201) {
          const errText = await resVal.text();
          console.error(`[${new Date().toISOString()}] Erro ao atualizar campo local no ClickUp [Status: ${resVal.status}]:`, errText);
        } else {
          console.log(`[${new Date().toISOString()}] Campo local (${campoValor.name}) atualizado com sucesso no ClickUp usando centavos (${flowName})!`);
          
          // Validação imediata via GET pós-POST
          try {
            console.log(`[${new Date().toISOString()}] Iniciando verificação GET pós-POST para a tarefa ${cleanTaskId}...`);
            const verifyRes = await fetch(`https://api.clickup.com/api/v2/task/${cleanTaskId}`, {
              headers: {
                "Authorization": API_KEY,
                "Content-Type": "application/json"
              }
            });
            if (verifyRes.ok) {
              const verifyTask = await verifyRes.json();
              const verifyField = verifyTask.custom_fields?.find(f => f.id === campoValor.id);
              const valorRetornado = verifyField ? verifyField.value : null;
              console.log(`[${new Date().toISOString()}] VALIDAÇÃO pós-update (${flowName}) para tarefa ${cleanTaskId}: Valor retornado no ClickUp =`, valorRetornado, `(Esperado centavos: ${bodyCentavos.value})`);
              if (cleanTaskId === '86ahby7wm') {
                console.log(`[${new Date().toISOString()}] [VALOR CONFIRMADO TASK 86ahby7wm] Valor pós-POST no ClickUp:`, valorRetornado);
              }
            }
          } catch (verifyErr) {
            console.error("Erro ao validar campo local:", verifyErr);
          }
        }
      } else {
        console.warn(`[${new Date().toISOString()}] Campo local de valor não encontrado na tarefa ${cleanTaskId}.`);
      }

      // b) Atualização global do Deal Value na tarefa pai (Negócio)
      const relField = currentTask.custom_fields.find(f => {
        if (f.type !== 'list_relationship') return false;
        const name = (f.name || "").toLowerCase();
        return name.includes('negócio') || name.includes('negocio') || name.includes('comercial proposal');
      });

      if (relField && relField.value && Array.isArray(relField.value) && relField.value.length > 0) {
        const parentTaskId = String(relField.value[0].id).replace('#', '').trim();
        const urlGlobal = `https://api.clickup.com/api/v2/task/${parentTaskId}/field/${DEAL_VALUE_FIELD_ID}`;
        const bodyCentavos = { value: valorCentavos };

        console.log(`[${new Date().toISOString()}] POST ${urlGlobal} - Body:`, JSON.stringify(bodyCentavos));

        if (cleanTaskId === '86ahby7wm' || parentTaskId === '86ahby7wm') {
          console.log(`[${new Date().toISOString()}] [DETECTOR TASK 86ahby7wm] Enviando Deal Value global para a tarefa pai ${parentTaskId}: ${bodyCentavos.value}`);
        }

        const resGlobal = await fetch(urlGlobal, {
          method: 'POST',
          headers: {
            "Authorization": API_KEY,
            "Content-Type": "application/json"
          },
          body: JSON.stringify(bodyCentavos)
        });

        if (resGlobal.status !== 200 && resGlobal.status !== 201) {
          const errText = await resGlobal.text();
          console.error(`[${new Date().toISOString()}] Erro crítico ao atualizar Deal Value global na tarefa ${parentTaskId} [Status: ${resGlobal.status}]:`, errText);
        } else {
          console.log(`[${new Date().toISOString()}] Deal Value global atualizado com sucesso no ClickUp (Tarefa Negócio Pai: ${parentTaskId})!`);

          // Validação imediata global via GET pós-POST
          try {
            console.log(`[${new Date().toISOString()}] Iniciando verificação GET pós-POST para a tarefa pai ${parentTaskId}...`);
            const verifyRes = await fetch(`https://api.clickup.com/api/v2/task/${parentTaskId}`, {
              headers: {
                "Authorization": API_KEY,
                "Content-Type": "application/json"
              }
            });
            if (verifyRes.ok) {
              const verifyTask = await verifyRes.json();
              const verifyField = verifyTask.custom_fields?.find(f => f.id === DEAL_VALUE_FIELD_ID);
              const valorRetornado = verifyField ? verifyField.value : null;
              console.log(`[${new Date().toISOString()}] VALIDAÇÃO Deal Value global pós-update (${flowName}) para tarefa ${parentTaskId}: valor =`, valorRetornado);
              if (parentTaskId === '86ahby7wm') {
                console.log(`[${new Date().toISOString()}] [VALOR CONFIRMADO TASK 86ahby7wm] Valor global pós-POST no ClickUp:`, valorRetornado);
              }
            }
          } catch (verifyErr) {
            console.error("Erro ao validar Deal Value global:", verifyErr);
          }
        }
      } else {
        console.warn(`[${new Date().toISOString()}] Relacionamento de Negócio/Comercial Proposal não encontrado na tarefa ${cleanTaskId}.`);
      }

    } catch (err) {
      console.error(`[${new Date().toISOString()}] Erro durante a sincronização dupla com o ClickUp (${flowName}):`, err);
    }
  };

  // 7. Ação de Salvar Proposta
