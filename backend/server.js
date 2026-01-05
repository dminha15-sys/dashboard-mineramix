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

// ID da SUA planilha - você vai colocar aqui
const SPREADSHEET_ID = process.env.SPREADSHEET_ID || '1Abns0jqPZ5ebcA5vOyg2FIJPApbnjah3HOk3rddepZU';

// ROTA PRINCIPAL - mostra que a API está funcionando
app.get('/', (req, res) => {
    res.send(`
        <html>
            <body style="font-family: Arial; padding: 20px;">
                <h1>✅ API do Dashboard Mineramix está FUNCIONANDO!</h1>
                <p><strong>Endpoints disponíveis:</strong></p>
                <ul>
                    <li><a href="/api/teste">/api/teste</a> - Teste simples</li>
                    <li><a href="/api/dados">/api/dados</a> - Seus dados da planilha</li>
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

// ROTA PARA BUSCAR DADOS DA PLANILHA
app.get('/api/dados', async (req, res) => {
    try {
        console.log('🔍 Tentando conectar ao Google Sheets...');
        
        // Configurar autenticação
        let auth;
        
        // Verificar se estamos no Render (com variável de ambiente)
        if (process.env.GOOGLE_CREDENTIALS) {
            // No Render - usar variável de ambiente
            const credentials = JSON.parse(process.env.GOOGLE_CREDENTIALS);
            auth = new google.auth.GoogleAuth({
                credentials: credentials,
                scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly']
            });
        } else {
            // Localmente - usar arquivo
            auth = new google.auth.GoogleAuth({
                keyFile: path.join(__dirname, '../dashboard-service-key.json'),
                scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly']
            });
        }
        
        const sheets = google.sheets({ version: 'v4', auth });
        
        // TENTAR buscar dados de uma aba simples primeiro
        const response = await sheets.spreadsheets.values.get({
        spreadsheetId: SPREADSHEET_ID,
        range: 'API_DADOS!A:K'  // Lê a aba nova e só as colunas que você usa
});
        
        const dados = response.data.values || [];
        
        console.log(`✅ Dados recebidos: ${dados.length} linhas`);
        
        res.json({
            status: 'sucesso',
            mensagem: 'Dados carregados do Google Sheets',
            totalLinhas: dados.length,
            dados: dados,
            atualizadoEm: new Date().toISOString()
        });
        
    } catch (error) {
        console.error('❌ ERRO ao buscar dados:', error.message);
        
        res.status(500).json({
            status: 'erro',
            mensagem: 'Falha ao conectar com Google Sheets',
            erro: error.message,
            dica: 'Verifique: 1) ID da planilha, 2) Compartilhamento com a conta de serviço, 3) Chave da API'
        });
    }
});

// Iniciar servidor
app.listen(PORT, () => {
    console.log(`🚀 Servidor rodando na porta ${PORT}`);
    console.log(`👉 Acesse: http://localhost:${PORT}`);
    console.log(`📊 API: http://localhost:${PORT}/api/dados`);
});
