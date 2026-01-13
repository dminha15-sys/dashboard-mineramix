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
