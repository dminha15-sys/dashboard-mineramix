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

async function carregarDados() {
    try {
        atualizarStatus(false, '🔄 Conectando e analisando dados...');
        const resposta = await fetch(CONFIG.API_URL);
        if (!resposta.ok) throw new Error(`Erro ${resposta.status}: ${resposta.statusText}`);
        const resultado = await resposta.json();
        if (resultado.status === 'erro') throw new Error(resultado.mensagem);
        dadosOriginais = resultado.dados;
        const cabecalhos = dadosOriginais[0];
        const colunasDetectadas = detectarColunas(cabecalhos);
        const colunaData = colunasDetectadas.find(c => c.tipo === 'data');
        indiceColunaData = colunaData ? colunaData.indice : null;
        console.log('📅 Índice da coluna de data:', indiceColunaData);
        dadosAnalisados = analisarDadosMineramix(dadosOriginais);
        mostrarRelatorio('overview');
        const agora = new Date().toLocaleTimeString('pt-BR');
        elementos.lastUpdate.textContent = `Última atualização: ${agora}`;
        atualizarStatus(true, `✅ ${dadosAnalisados.totalLinhas} registros analisados`);
        mostrarNotificacao('✅ Dados carregados com sucesso', 'success');
    } catch (erro) {
        console.error(erro);
        atualizarStatus(false, `❌ ${erro.message}`);
        mostrarNotificacao(`❌ Erro: ${erro.message}`, 'error');
        elementos.contentArea.innerHTML = `<div class="loading"><i class="fas fa-exclamation-triangle"></i><p>Erro ao analisar dados: ${erro.message}</p><button class="btn btn-primary" onclick="carregarDados()" style="margin-top: 1rem;">Tentar Novamente</button></div>`;
    }
}



let cacheDados = null;
let cacheAtualizadoEm = null;
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutos

app.get('/api/dados', async (req, res) => {
  const agora = Date.now();
  if (cacheDados && cacheAtualizadoEm && agora - cacheAtualizadoEm < CACHE_TTL_MS) {
    return res.json(cacheDados);
  }

  try {
    // ... mesma lógica atual para buscar no Sheets ...
    const resposta = await sheets.spreadsheets.values.get({ ... });
    const dados = resposta.data.values || [];

    cacheDados = {
      status: 'sucesso',
      mensagem: 'Dados carregados do Google Sheets',
      totalLinhas: dados.length - 1,
      dados,
      atualizadoEm: new Date().toISOString(),
    };
    cacheAtualizadoEm = agora;

    return res.json(cacheDados);
  } catch (error) {
    // ...
  }
});
