const express = require('express');
const cors = require('cors');
const { google } = require('googleapis');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Permitir acesso de qualquer lugar (para testes)
app.use(cors());
app.use(express.json());

// Servir arquivos estáticos do frontend (se quiser tudo junto)
app.use(express.static(path.join(__dirname, '../frontend')));

// ID da SUA planilha
const SPREADSHEET_ID = process.env.SPREADSHEET_ID || '1Abns0jqPZ5ebcA5vOyg2FIJPApbnjah3HOk3rddepZU';

// ====================================================
// SISTEMA DE CACHE (Memória RAM)
// ====================================================
let cacheDados = null;
let cacheUltimaAtualizacao = 0;
const CACHE_TEMPO_MS = 5 * 60 * 1000; // 5 minutos em milissegundos

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
app.get('/api/dados', async (req, res) => {
    const agora = Date.now();

    // 1. Verifica se tem cache válido (menos de 5 minutos)
    if (cacheDados && (agora - cacheUltimaAtualizacao < CACHE_TEMPO_MS)) {
        console.log('⚡ Cache Válido! Entregando dados instantâneos.');
        return res.json(cacheDados);
    }

    console.log('🔄 Cache expirado ou vazio. Conectando ao Google Sheets...');

    try {
        let auth;
        if (process.env.GOOGLE_CREDENTIALS) {
            const credentials = JSON.parse(process.env.GOOGLE_CREDENTIALS);
            auth = new google.auth.GoogleAuth({
                credentials: credentials,
                scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly']
            });
        } else {
            auth = new google.auth.GoogleAuth({
                keyFile: path.join(__dirname, '../dashboard-service-key.json'),
                scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly']
            });
        }
        
        const sheets = google.sheets({ version: 'v4', auth });
        
        const response = await sheets.spreadsheets.values.get({
            spreadsheetId: SPREADSHEET_ID,
            range: 'API_DADOS!A:K'
        });
        
        const dados = response.data.values || [];
        
        console.log(`✅ Google respondeu! ${dados.length} linhas recebidas.`);
        
        // Monta a resposta
        const resultadoFinal = {
            status: 'sucesso',
            mensagem: 'Dados carregados do Google Sheets',
            origem: 'google_sheets_live',
            totalLinhas: dados.length - 1,
            dados: dados,
            atualizadoEm: new Date().toISOString()
        };

        // 2. Salva no Cache
        cacheDados = { ...resultadoFinal, origem: 'cache_memoria' }; // Marca como cache para a próxima vez
        cacheUltimaAtualizacao = agora;
        
        // Entrega o resultado fresco
        res.json(resultadoFinal);
        
    } catch (error) {
        console.error('❌ ERRO ao buscar dados no Google:', error.message);
        
        // 3. Fallback: Se o Google falhar, tenta entregar o cache antigo se existir
        if (cacheDados) {
            console.log('⚠️ Usando cache antigo para evitar queda do sistema.');
            return res.json(cacheDados);
        }

        res.status(500).json({
            status: 'erro',
            mensagem: 'Falha ao conectar com Google Sheets e sem cache disponível',
            erro: error.message
        });
    }
});

// Iniciar servidor
app.listen(PORT, () => {
    console.log(`🚀 Servidor rodando na porta ${PORT}`);
    console.log(`👉 Acesse: http://localhost:${PORT}`);
    console.log(`📊 API: http://localhost:${PORT}/api/dados`);
});
