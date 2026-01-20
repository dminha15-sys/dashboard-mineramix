const express = require('express');
const cors = require('cors');
const { google } = require('googleapis');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../frontend')));

const SPREADSHEET_ID = process.env.SPREADSHEET_ID || '1Abns0jqPZ5ebcA5vOyg2FIJPApbnjah3HOk3rddepZU';

// ====================================================
// SISTEMA DE CACHE (Memória RAM) - LONGA DURAÇÃO
// ====================================================
let cacheDados = null;
let cacheUltimaAtualizacao = 0;

// CONFIGURAÇÃO DO TEMPO DE CACHE:
// 12 horas = 12 * 60 minutos * 60 segundos * 1000 milissegundos
const CACHE_TEMPO_MS = 12 * 60 * 60 * 1000; 

// ROTA PRINCIPAL
app.get('/', (req, res) => {
    res.send('API Online 🚀');
});

// ROTA INTELIGENTE COM CACHE E 2 ABAS
app.get('/api/dados', async (req, res) => {
    const agora = Date.now();
    const forcarAtualizacao = req.query.atualizar === 'sim'; // Permite forçar atualização manual

    // 1. VERIFICA SE TEM CACHE VÁLIDO E NÃO PEDIU PARA FORÇAR
    if (!forcarAtualizacao && cacheDados && (agora - cacheUltimaAtualizacao < CACHE_TEMPO_MS)) {
        console.log('⚡ Cache Válido! Entregando dados instantâneos.');
        return res.json(cacheDados);
    }

    console.log('🔄 Buscando dados novos no Google Sheets...');

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
        
        // 2. BUSCA AS DUAS ABAS (LENTO 🐢)
        const response = await sheets.spreadsheets.values.batchGet({
            spreadsheetId: SPREADSHEET_ID,
            ranges: ['API_DADOS!A:K', 'COMBUSTIVEL!A:H']
        });
        
        const dadosGerais = response.data.valueRanges[0].values || [];
        const dadosCombustivel = response.data.valueRanges[1].values || [];
        
        console.log(`✅ Dados Atualizados! Geral: ${dadosGerais.length} | Comb: ${dadosCombustivel.length}`);
        
        // Monta o objeto
        const resultadoFinal = {
            status: 'sucesso',
            mensagem: 'Dados carregados',
            origem: 'google_sheets_live',
            totalLinhas: dadosGerais.length - 1,
            dados: dadosGerais,
            dadosCombustivel: dadosCombustivel,
            atualizadoEm: new Date().toISOString()
        };

        // 3. SALVA NA MEMÓRIA (CACHE)
        cacheDados = { ...resultadoFinal, origem: 'cache_memoria' };
        cacheUltimaAtualizacao = agora;
        
        res.json(resultadoFinal);
        
    } catch (error) {
        console.error('❌ ERRO:', error.message);
        
        // Fallback: Se o Google falhar, entrega o cache antigo se tiver
        if (cacheDados) {
            console.log('⚠️ Erro no Google, entregando cache antigo por segurança.');
            return res.json(cacheDados);
        }

        res.status(500).json({ status: 'erro', mensagem: 'Erro na API', erro: error.message });
    }
});

app.listen(PORT, () => {
    console.log(`🚀 Servidor rodando na porta ${PORT}`);
});
