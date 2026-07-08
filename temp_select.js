  const handleSelectProposal = async () => {
    if (!currentProposta || !clickupTaskId) return;
    const taskId = String(clickupTaskId).replace('#', '').trim();
    setSaving(true);
    try {
      if (!isReadOnly) {
        await handleSaveProposal();
      }

      // 1. REGRA CONDICIONAL DUPLA DA CADEIRA ÚNICA
      if (isProjeto === false) {
        // REGRA VENDA SIMPLES: Mudar TODAS as outras propostas do mesmo 'clickup_negocio_id' para 'Desconsiderada'
        await supabaseClient
          .from('propostas')
          .update({ situacao: 'Desconsiderada' })
          .eq('clickup_negocio_id', clickupTaskId)
          .neq('id', currentProposta.id);
      } else {
        // REGRA PROJETO COMPLEXO: Mudar as outras propostas apenas de 'Selecionada' para 'Ativa'
        await supabaseClient
          .from('propostas')
          .update({ situacao: 'Ativa' })
          .eq('clickup_negocio_id', clickupTaskId)
          .eq('situacao', 'Selecionada')
          .neq('id', currentProposta.id);
      }

      // 2. Atualiza a proposta atual para 'Selecionada' no Supabase
      const { error } = await supabaseClient
        .from('propostas')
        .update({ 
          situacao: 'Selecionada',
          total_proposta: realTimeGrandTotal,
          clickup_negocio_id: clickupTaskId,
          versao: currentProposta.versao
        })
        .eq('id', currentProposta.id);

      if (error) throw error;

      await syncClickUpProposta(clickupTaskId, realTimeGrandTotal, 'Select');

      showToast('Proposta selecionada e ClickUp atualizado com sucesso!', 'success');
      loadPropostas(currentProposta.id);
    } catch (err) {
      console.error(err);
      showToast('Erro ao selecionar ou sincronizar com ClickUp.', 'error');
    } finally {
      setSaving(false);
    }
  };
