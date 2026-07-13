  const handleMarkAsWon = async () => {
    if (!currentProposta || !clickupTaskId || !supabaseClient) return;
    const taskId = String(clickupTaskId).replace('#', '').trim();
    setSaving(true);
    try {
      if (!isReadOnly) {
        await handleSaveProposal();
      }

      // 1. Atualizar a proposta atual para 'Ganho' no Supabase
      const { error } = await supabaseClient
        .from('propostas')
        .update({ 
          situacao: 'Ganho',
          total_proposta: realTimeGrandTotal
        })
        .eq('id', currentProposta.id);

      if (error) throw error;

      await syncClickUpProposta(clickupTaskId, realTimeGrandTotal, 'Won');

      // 4. Mudar o status do card no ClickUp para 'ganho'
      {
        const body = { status: 'ganho' };
        const resStat = await fetch(`https://api.clickup.com/api/v2/task/${taskId}`, {
          method: 'PUT',
          headers: {
            "Authorization": API_KEY,
            "Content-Type": "application/json"
          },
          body: JSON.stringify(body)
        });
        if (resStat.status !== 200 && resStat.status !== 201) {
          const errText = await resStat.text();
          console.error(`Erro ao atualizar Status no ClickUp (Won) [Status: ${resStat.status}]:`, errText);
        }
      }

      showToast('Proposta marcada como GANHA e status do ClickUp atualizado!', 'success');
      loadPropostas(currentProposta.id);
      loadDashboardData();
    } catch (err) {
      console.error(err);
      showToast('Erro ao marcar proposta como ganha.', 'error');
    } finally {
      setSaving(false);
    }
  };
