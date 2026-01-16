// Configurações do frontend
const CONFIG = {
    // URL da sua API
    API_URL: 'https://dashboard-mineramix-backend.onrender.com/api/dados',
       
    UPDATE_INTERVAL: 300000, // 5 minutos
    
    // Cores
    COLORS: {
        primary: '#000000',
        secondary: '#FF6B35',
        success: '#28a745',
        warning: '#ffc107',
        danger: '#dc3545'
    }
};

// Função Principal de Carregamento
async function carregarDados() {
    try {
        atualizarStatus(false, '🔄 Conectando e analisando dados...');
        
        // Faz a requisição (que agora será rápida por causa do cache)
        const resposta = await fetch(CONFIG.API_URL);
        if (!resposta.ok) throw new Error(`Erro ${resposta.status}: ${resposta.statusText}`);
        
        const resultado = await resposta.json();
        if (resultado.status === 'erro') throw new Error(resultado.mensagem);
        
        // === SALVA DADOS GLOBAIS ===
        dadosOriginais = resultado.dados; // Aba API_DADOS
        dadosCombustivelOriginais = resultado.dadosCombustivel; // Aba COMBUSTIVEL
        
        // Detecta colunas
        const cabecalhos = dadosOriginais[0];
        const colunasDetectadas = detectarColunas(cabecalhos);
        const colunaData = colunasDetectadas.find(c => c.tipo === 'data');
        indiceColunaData = colunaData ? colunaData.indice : null;
        
        // Analisa
        dadosAnalisados = analisarDadosMineramix(dadosOriginais);
        mostrarRelatorio('overview');
        
        const agora = new Date().toLocaleTimeString('pt-BR');
        if(elementos.lastUpdate) elementos.lastUpdate.textContent = `Última atualização: ${agora}`;
        
        // Aviso de Cache (Opcional, para você saber se veio rápido)
        const origemMsg = resultado.origem === 'cache_memoria' ? '⚡ (Cache)' : '☁️ (Google)';
        atualizarStatus(true, `✅ Dados carregados ${origemMsg}`);
        mostrarNotificacao(`✅ Dados carregados com sucesso ${origemMsg}`, 'success');
        
    } catch (erro) {
        console.error(erro);
        atualizarStatus(false, `❌ ${erro.message}`);
        mostrarNotificacao(`❌ Erro: ${erro.message}`, 'error');
        
        if(elementos.contentArea) {
            elementos.contentArea.innerHTML = `<div class="loading"><i class="fas fa-exclamation-triangle"></i><p>Erro ao analisar dados: ${erro.message}</p><button class="btn btn-primary" onclick="carregarDados()" style="margin-top: 1rem;">Tentar Novamente</button></div>`;
        }
    }
}
