// Configurações do frontend
const CONFIG = {
    // Mude para sua URL do Render quando hospedar
    API_URL: 'https://dashboard-mineramix-backend.onrender.com/api/dados',
       
    UPDATE_INTERVAL: 300000, // 5 minutos
    ITEMS_PER_PAGE: 10,
    
    // Cores do dashboard
    COLORS: {
        primary: '#000000',
        secondary: '#FF6B35',
        success: '#28a745',
        warning: '#ffc107',
        danger: '#dc3545'
    }
};

// Função Principal de Carregamento (Fica aqui para ser compartilhada)
async function carregarDados() {
    try {
        atualizarStatus(false, '🔄 Conectando e analisando dados...');
        
        const resposta = await fetch(CONFIG.API_URL);
        if (!resposta.ok) throw new Error(`Erro ${resposta.status}: ${resposta.statusText}`);
        
        const resultado = await resposta.json();
        if (resultado.status === 'erro') throw new Error(resultado.mensagem);
        
        // Salva os dados nas variáveis globais do app.js
        dadosOriginais = resultado.dados;
        
        // Detecta colunas e processa
        const cabecalhos = dadosOriginais[0];
        const colunasDetectadas = detectarColunas(cabecalhos);
        const colunaData = colunasDetectadas.find(c => c.tipo === 'data');
        indiceColunaData = colunaData ? colunaData.indice : null;
        
        console.log('📅 Índice da coluna de data:', indiceColunaData);
        
        dadosAnalisados = analisarDadosMineramix(dadosOriginais);
        mostrarRelatorio('overview');
        
        const agora = new Date().toLocaleTimeString('pt-BR');
        if(elementos.lastUpdate) elementos.lastUpdate.textContent = `Última atualização: ${agora}`;
        
        atualizarStatus(true, `✅ ${dadosAnalisados.totalLinhas} registros analisados`);
        mostrarNotificacao('✅ Dados carregados com sucesso', 'success');
        
    } catch (erro) {
        console.error(erro);
        atualizarStatus(false, `❌ ${erro.message}`);
        mostrarNotificacao(`❌ Erro: ${erro.message}`, 'error');
        
        if(elementos.contentArea) {
            elementos.contentArea.innerHTML = `<div class="loading"><i class="fas fa-exclamation-triangle"></i><p>Erro ao analisar dados: ${erro.message}</p><button class="btn btn-primary" onclick="carregarDados()" style="margin-top: 1rem;">Tentar Novamente</button></div>`;
        }
    }
}
