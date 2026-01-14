const express = require('express');
const cors = require('cors');
const { google } = require('googleapis');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// === CACHE EM MEMÓRIA PARA /api/dados ===
let cacheDados = null;           // último resultado retornado
let cacheAtualizadoEm = null;    // timestamp em ms
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutos
// =======================================a

// Permitir acesso de qualquer lugar (para testes)
app.use(cors());
app.use(express.json());

// Servir arquivos estáticos do frontend (se quiser tudo junto)
app.use(express.static(path.join(__dirname, '../frontend')));

// ID da SUA planilha
const SPREADSHEET_ID = process.env.SPREADSHEET_ID || '1Abns0jqPZ5ebcA5vOyg2FIJPApbnjah3HOk3rddepZU';


// ROTA PRINCIPAL
app.get('/', (req, res) => {
    res.send(`
        <html>
            <body style="font-family: Arial; padding: 20px;">
                <h1>✅ API do Dashboard Mineramix está FUNCIONANDO!</h1>
                <p><strong>Endpoints disponíveis:</strong></p>
                <ul>
                    <li><a href="/api/teste">/api/teste</a> - Teste simples</li>
                    <li><a href="/api/dados">/api/dados</a> - Seus dados da planilha (Com Cache ⚡)</li>
                </ul>
                <p>Se você está vendo esta mensagem, o backend está online! 🎉</p>
            </body>
        </html>
    `);
});

// ROTA DE TESTE SIMPLES
app.get('/api/teste', (req, res) => {
    res.json({
        status: 'sucesso',
        mensagem: 'API funcionando perfeitamente!',
        data: new Date().toISOString()
    });
});

// ROTA INTELIGENTE COM CACHE
// ROTA PARA BUSCAR DADOS DA PLANILHA (COM CACHE)
app.get('/api/dados', async (req, res) => {
  try {
    const agora = Date.now();

    // 1) Se já temos cache recente, devolve direto
    if (cacheDados && cacheAtualizadoEm && (agora - cacheAtualizadoEm) < CACHE_TTL_MS) {
      console.log('✅ Devolvendo dados do CACHE (sem chamar Google Sheets)');
      return res.json(cacheDados);
    }

    console.log('🔍 Cache vencido ou vazio. Buscando dados no Google Sheets...');

    // 2) Autenticação com Google (igual você já tinha)
    let auth;
    if (process.env.GOOGLE_CREDENTIALS) {
      const credentials = JSON.parse(process.env.GOOGLE_CREDENTIALS);
      auth = new google.auth.GoogleAuth({
        credentials,
        scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
      });
    } else {
      auth = new google.auth.GoogleAuth({
        keyFile: path.join(__dirname, '../dashboard-service-key.json'),
        scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
      });
    }

    const sheets = google.sheets({ version: 'v4', auth });

    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: 'API_DADOS!A:K',
    });

    const dados = response.data.values || [];
    console.log(`✅ Dados recebidos do Google Sheets: ${dados.length} linhas`);

    // 3) Monta objeto de resposta
    const payload = {
      status: 'sucesso',
      mensagem: 'Dados carregados do Google Sheets',
      totalLinhas: dados.length - 1,  // sem cabeçalho
      dados,
      atualizadoEm: new Date().toISOString(),
      origem: 'google',
    };

    // 4) Atualiza o cache
    cacheDados = payload;
    cacheAtualizadoEm = agora;

    // 5) Retorna para o cliente
    return res.json(payload);

  } catch (error) {
    console.error('❌ ERRO ao buscar dados:', error.message);

    // Se der erro, mas temos cache antigo, devolve o cache como fallback
    if (cacheDados) {
      console.warn('⚠️ Erro no Google Sheets, devolvendo dados do cache antigo');
      return res.json({
        ...cacheDados,
        origem: 'cache-antigo',
        aviso: 'Erro ao atualizar do Google Sheets. Dados do cache antigo.',
        erroOriginal: error.message,
      });
    }

    // Sem cache, erro normal
    return res.status(500).json({
      status: 'erro',
      mensagem: 'Falha ao conectar com Google Sheets',
      erro: error.message,
      dica: 'Verifique: 1) ID da planilha, 2) Compartilhamento com a conta de serviço, 3) Chave da API',
    });
  }
});


// ROTA PARA LIMPAR O CACHE MANUALMENTE (ex: /api/dados/refresh)
app.post('/api/dados/refresh', (req, res) => {
  cacheDados = null;
  cacheAtualizadoEm = null;
  console.log('♻️ Cache de /api/dados foi limpo manualmente');
  res.json({ status: 'ok', mensagem: 'Cache limpo. Próxima chamada vai buscar no Google.' });
});




// Iniciar servidor
app.listen(PORT, () => {
    console.log(`🚀 Servidor rodando na porta ${PORT}`);
    console.log(`👉 Acesse: http://localhost:${PORT}`);
    console.log(`📊 API: http://localhost:${PORT}/api/dados`);
});
