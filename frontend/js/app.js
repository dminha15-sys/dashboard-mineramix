// ==========================================
// 1. CONFIGURAÇÕES E CONSTANTES GLOBAIS
// ==========================================
const CUSTOS = {
    DIESEL_PRECO: 6.00,
    CONSUMO_MEDIO: 2.0, // km/L
    MANUTENCAO_PCT: 0.12 // 12% sobre o faturamento
};

// A constante CONFIG vem do arquivo config.js

const CUSTO_PEDAGIOS = {
    'AUTOPISTA_FLUMINENSE': 6.90, // Pedágio BR-101
    'VIA_LAGOS': 27.00,           // Pedágio Via Lagos
    'PONTE_RIO_NITEROI': 6.20,
    'OUTROS': 0.00
};

// Variáveis de Estado
let dadosAnalisados = null;
let dadosOriginais = null;
let dadosCombustivelOriginais = null; // DADOS DA ABA COMBUSTÍVEL
let indiceColunaData = null;
let chartInstance = null; // Para o gráfico

// Elementos do DOM
const elementos = {
    contentArea: document.getElementById('contentArea'),
    reportTitle: document.getElementById('reportTitle'),
    reportSubtitle: document.getElementById('reportSubtitle'),
    statusText: document.getElementById('statusText'),
    statusDot: document.getElementById('statusDot'),
    lastUpdate: document.getElementById('lastUpdate'),
};

// ==========================================
// 2. FUNÇÕES DE LEITURA E PARSEAMENTO
// ==========================================

function detectColumnsGlobal(cabecalhos) {
    const map = {};
    cabecalhos.forEach((c, i) => {
        const t = String(c).toLowerCase();
        if(t.includes('motorista')) map.motorista = i;
        if(t.includes('origem')) map.origem = i;
        if(t.includes('destino')) map.destino = i;
    });
    return map;
}

function detectarColunas(cabecalhos) {
    console.log("🔍 Cabeçalhos recebidos:", cabecalhos);
    const mapeamento = {};
    cabecalhos.forEach((cabecalho, index) => {
        if (!cabecalho) return;
        const limpo = String(cabecalho).toLowerCase().trim().normalize("NFD").replace(/[\u0300-\u036f]/g, ""); 
        
        if (limpo.includes('data') && !limpo.includes('pgto')) mapeamento['DATA'] = { indice: index, tipo: 'data' };
        else if (limpo.includes('cliente')) mapeamento['CLIENTE'] = { indice: index, tipo: 'cliente' };
        else if (limpo.includes('motorista')) mapeamento['MOTORISTA'] = { indice: index, tipo: 'motorista' };
        else if (limpo.includes('placa') || limpo.includes('veiculo') || limpo.includes('cavalo') || limpo.includes('frota')) mapeamento['PLACA'] = { indice: index, tipo: 'veiculo' };
        else if (limpo.includes('origem')) mapeamento['ORIGEM'] = { indice: index, tipo: 'origem' };
        else if (limpo.includes('destino')) mapeamento['DESTINO'] = { indice: index, tipo: 'destino' };
        else if (limpo.includes('km') || limpo.includes('quilometragem')) mapeamento['KM'] = { indice: index, tipo: 'km' };
        else if (limpo.includes('valor') || limpo.includes('total') || limpo.includes('preco')) mapeamento['VALOR'] = { indice: index, tipo: 'valor' };
        else if (limpo.includes('forma') && limpo.includes('pgto')) mapeamento['FORMA_PGTO'] = { indice: index, tipo: 'pagamento' };
        else if (limpo.includes('status')) mapeamento['STATUS'] = { indice: index, tipo: 'status' };
    });
    const colunas = [];
    Object.keys(mapeamento).forEach(nome => {
        colunas.push({ nome: nome, indice: mapeamento[nome].indice, tipo: mapeamento[nome].tipo });
    });
    return colunas;
}

function extrairNumero(texto) {
    if (!texto) return 0;
    const limpo = String(texto).replace('R$', '').replace(/\./g, '').replace(',', '.').replace(/[^\d.-]/g, '').trim();
    const numero = parseFloat(limpo);
    return isNaN(numero) ? 0 : numero;
}

function parsearDataBR(dataStr) {
    if (!dataStr) return null;
    try {
        const partes = dataStr.split('/');
        if (partes.length === 3) {
            const dia = parseInt(partes[0]);
            const mes = parseInt(partes[1]) - 1;
            const ano = parseInt(partes[2]);
            const anoCompleto = ano < 100 ? 2000 + ano : ano;
            return new Date(anoCompleto, mes, dia);
        }
        return new Date(dataStr);
    } catch (e) { return null; }
}

function analisarDadosMineramix(dados) {
    if (!dados || dados.length < 5) return null;
    let indiceCabecalho = -1;
    for (let i = 0; i < 10; i++) {
        const linhaStr = dados[i].join(' ').toUpperCase();
        if (linhaStr.includes('DATA') && (linhaStr.includes('MOTORISTA') || linhaStr.includes('CLIENTE'))) {
            indiceCabecalho = i;
            break;
        }
    }
    if (indiceCabecalho === -1) return null;

    const cabecalhos = dados[indiceCabecalho];
    const linhasBrutas = dados.slice(indiceCabecalho + 1);
    const colunas = detectarColunas(cabecalhos);
    const idx = {};
    colunas.forEach(col => { idx[col.tipo] = col.indice; });

    const resumo = {
        totalLinhas: 0, totalValor: 0, totalKM: 0,
        status: {}, pagamentos: {}, motoristas: {}, 
        veiculos: {}, clientes: {}, rotas: {}, dias: {}, meses: {},
        valores: [], kms: []
    };

    for (let i = 0; i < linhasBrutas.length; i++) {
        const linha = linhasBrutas[i];
        const linhaTexto = linha.join(' ').toUpperCase();
        if (linhaTexto.includes('TOTAL A RECEBER') || linhaTexto.includes('TOTAL PAGO') || linhaTexto.includes('SALDO')) break;

        const dataRaw = idx.data !== undefined ? linha[idx.data] : null;
        if (!dataRaw || String(dataRaw).trim() === '') continue;
        const dataObj = parsearDataBR(dataRaw);
        if (!dataObj) continue;

        const valor = idx.valor !== undefined ? extrairNumero(linha[idx.valor]) : 0;
        const km = idx.km !== undefined ? extrairNumero(linha[idx.km]) : 0;
        
        let motorista = idx.motorista !== undefined ? linha[idx.motorista] : 'NÃO IDENTIFICADO';
        if (!motorista || String(motorista).trim() === '') motorista = 'NÃO IDENTIFICADO';

        let veiculo = idx.veiculo !== undefined ? linha[idx.veiculo] : 'NÃO IDENTIFICADO';
        if (!veiculo || String(veiculo).trim() === '' || String(veiculo) === 'undefined') veiculo = 'NÃO IDENTIFICADO';

        const cliente = idx.cliente !== undefined ? linha[idx.cliente] : 'Não informado';
        const origem = idx.origem !== undefined ? linha[idx.origem] : '';
        const destino = idx.destino !== undefined ? linha[idx.destino] : '';
        const status = idx.status !== undefined ? linha[idx.status] : 'Não informado';

        resumo.totalLinhas++;
        resumo.totalValor += valor;
        resumo.totalKM += km;
        resumo.valores.push(valor);
        resumo.kms.push(km);

        if (!resumo.motoristas[motorista]) resumo.motoristas[motorista] = { viagens: 0, valor: 0, km: 0 };
        resumo.motoristas[motorista].viagens++; resumo.motoristas[motorista].valor += valor; resumo.motoristas[motorista].km += km;

        if (!resumo.veiculos[veiculo]) resumo.veiculos[veiculo] = { viagens: 0, valor: 0, km: 0 };
        resumo.veiculos[veiculo].viagens++; resumo.veiculos[veiculo].valor += valor; resumo.veiculos[veiculo].km += km;

        if (!resumo.clientes[cliente]) resumo.clientes[cliente] = { viagens: 0, valor: 0 };
        resumo.clientes[cliente].viagens++; resumo.clientes[cliente].valor += valor;

        const rota = `${origem} → ${destino}`;
        if (!resumo.rotas[rota]) resumo.rotas[rota] = { viagens: 0, valor: 0, km: 0 };
        resumo.rotas[rota].viagens++; resumo.rotas[rota].valor += valor; resumo.rotas[rota].km += km;

        const dia = dataObj.toLocaleDateString('pt-BR');
        const mes = `${dataObj.getMonth() + 1}/${dataObj.getFullYear()}`;
        if (!resumo.dias[dia]) resumo.dias[dia] = { viagens: 0, valor: 0 };
        resumo.dias[dia].viagens++; resumo.dias[dia].valor += valor;
        if (!resumo.meses[mes]) resumo.meses[mes] = { viagens: 0, valor: 0 };
        resumo.meses[mes].viagens++; resumo.meses[mes].valor += valor;
    }

    resumo.mediaValor = resumo.totalLinhas > 0 ? resumo.totalValor / resumo.totalLinhas : 0;
    resumo.mediaKM = resumo.totalLinhas > 0 ? resumo.totalKM / resumo.totalLinhas : 0;

    resumo.motoristasOrdenados = Object.entries(resumo.motoristas).sort((a, b) => b[1].valor - a[1].valor);
    resumo.veiculosOrdenados = Object.entries(resumo.veiculos).sort((a, b) => b[1].valor - a[1].valor);
    resumo.clientesOrdenados = Object.entries(resumo.clientes).sort((a, b) => b[1].valor - a[1].valor);
    resumo.rotasOrdenadas = Object.entries(resumo.rotas).sort((a, b) => b[1].viagens - a[1].viagens).slice(0, 10);
    resumo.diasOrdenados = Object.entries(resumo.dias).sort((a, b) => new Date(b[0].split('/').reverse().join('-')) - new Date(a[0].split('/').reverse().join('-')));

    return resumo;
}

// ==========================================
// 3. FUNÇÕES DE VISUALIZAÇÃO E UI
// ==========================================

function formatarMoeda(valor) {
    return 'R$ ' + valor.toFixed(2).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}
function formatarNumero(numero) {
    return numero.toFixed(0).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}
function atualizarStatus(online, mensagem) {
    if(elementos.statusText) elementos.statusText.textContent = mensagem;
    if(elementos.statusDot) elementos.statusDot.className = online ? 'status-dot online' : 'status-dot offline';
}

function mostrarNotificacao(mensagem, tipo) {
    const notificacao = document.createElement('div');
    notificacao.style.cssText = `position: fixed; top: 20px; right: 20px; padding: 1rem 1.5rem; border-radius: 8px; color: white; font-weight: 500; z-index: 1000; animation: slideIn 0.3s ease-out; box-shadow: 0 5px 15px rgba(0,0,0,0.1); background: ${tipo === 'success' ? '#28a745' : '#dc3545'};`;
    notificacao.textContent = mensagem;
    document.body.appendChild(notificacao);
    setTimeout(() => {
        notificacao.style.animation = 'slideOut 0.3s ease-in';
        setTimeout(() => { if (notificacao.parentNode) document.body.removeChild(notificacao); }, 300);
    }, 5000);
}

function toggleDarkMode() {
    document.body.classList.toggle('dark');
    const icon = document.querySelector('#btnDark i');
    if (document.body.classList.contains('dark')) {
        if(icon) icon.className = 'fas fa-sun';
        localStorage.setItem('darkMode', 'on');
    } else {
        if(icon) icon.className = 'fas fa-moon';
        localStorage.setItem('darkMode', 'off');
    }
}

// ==========================================
// 4. RELATÓRIOS
// ==========================================

function mostrarRelatorio(tipo) {
    if (!dadosAnalisados) {
        elementos.contentArea.innerHTML = `<div class="loading"><i class="fas fa-exclamation-triangle"></i><p>Nenhum dado disponível. Clique em "Atualizar".</p></div>`;
        return;
    }

    // Sincroniza menu
    const menuItems = document.querySelectorAll('.menu-item');
    menuItems.forEach(item => {
        item.classList.remove('active');
        if (item.getAttribute('data-report') === tipo) {
            item.classList.add('active');
        }
    });

    const resumo = dadosAnalisados;
    if (elementos.reportTitle) elementos.reportTitle.textContent = 'Dashboard Mineramix';
    if (elementos.reportSubtitle) elementos.reportSubtitle.textContent = `${resumo.totalLinhas} viagens analisadas`;

    switch (tipo) {
        case 'overview': mostrarVisaoGeral(resumo); break;
        case 'motoristas': mostrarRelatorioMotoristas(resumo); break;
        case 'veiculos': mostrarRelatorioVeiculos(resumo); break;
        case 'clientes': mostrarRelatorioClientes(resumo); break;
        case 'rotas': mostrarRelatorioRotas(resumo); break;
        case 'diario': mostrarRelatorioDiario(resumo); break;
        case 'km': mostrarRelatorioKM(resumo); break;
        default: mostrarVisaoGeral(resumo);
    }
}

function mostrarVisaoGeral(resumo) {
    const metricsHTML = `
        <div class="metrics-grid">
            <div class="metric-card"><div class="metric-icon"><i class="fas fa-route"></i></div><div class="metric-value">${resumo.totalLinhas}</div><div class="metric-label">Total de Viagens</div></div>
            <div class="metric-card"><div class="metric-icon"><i class="fas fa-money-bill-wave"></i></div><div class="metric-value">${formatarMoeda(resumo.totalValor)}</div><div class="metric-label">Faturamento Total</div></div>
            <div class="metric-card"><div class="metric-icon"><i class="fas fa-calculator"></i></div><div class="metric-value">${formatarMoeda(resumo.mediaValor)}</div><div class="metric-label">Média por Viagem</div></div>
            <div class="metric-card"><div class="metric-icon"><i class="fas fa-road"></i></div><div class="metric-value">${formatarNumero(resumo.totalKM)}</div><div class="metric-label">KM Total</div></div>
            <div class="metric-card"><div class="metric-icon"><i class="fas fa-user-tie"></i></div><div class="metric-value">${Object.keys(resumo.motoristas).length}</div><div class="metric-label">Motoristas</div></div>
            <div class="metric-card"><div class="metric-icon"><i class="fas fa-truck"></i></div><div class="metric-value">${Object.keys(resumo.veiculos).length}</div><div class="metric-label">Veículos</div></div>
        </div>
    `;
    const topMotoristas = resumo.motoristasOrdenados.slice(0, 5);
    const topVeiculos = resumo.veiculosOrdenados.slice(0, 5);
    
    // --- TOP MESES (RESTAURADO) ---
    const mesesMap = {};
    Object.entries(resumo.dias || {}).forEach(([data, info]) => {
        const partes = data.split('/'); 
        if(partes.length === 3) {
            const mesAno = `${partes[1]}/${partes[2]}`;
            if(!mesesMap[mesAno]) mesesMap[mesAno] = { valor: 0, viagens: 0 };
            mesesMap[mesAno].valor += info.valor;
            mesesMap[mesAno].viagens += info.viagens;
        }
    });
    const topMeses = Object.entries(mesesMap).sort((a,b) => b[1].valor - a[1].valor).slice(0, 5);
    // --------------------------------

    const summaryHTML = `
    <div class="summary-cards">
        <div class="summary-card">
            <div class="summary-header"><div class="summary-title">Top 5 Motoristas</div><div class="summary-icon"><i class="fas fa-user-tie"></i></div></div>
            <table class="summary-table"><thead><tr><th>Motorista</th><th>Viagens</th><th>Total</th></tr></thead><tbody>
                ${topMotoristas.map(([nome, dados]) => `<tr><td>${nome}</td><td class="center">${dados.viagens}</td><td class="money">${formatarMoeda(dados.valor)}</td></tr>`).join('')}
            </tbody></table>
        </div>
        <div class="summary-card">
            <div class="summary-header"><div class="summary-title">Top 5 Veículos</div><div class="summary-icon"><i class="fas fa-truck"></i></div></div>
            <table class="summary-table"><thead><tr><th>Placa</th><th>Viagens</th><th>Total</th></tr></thead><tbody>
                ${topVeiculos.map(([placa, dados]) => `<tr><td>${placa}</td><td class="center">${dados.viagens}</td><td class="money">${formatarMoeda(dados.valor)}</td></tr>`).join('')}
            </tbody></table>
        </div>
        <div class="summary-card">
            <div class="summary-header"><div class="summary-title">Top 5 Meses</div><div class="summary-icon"><i class="fas fa-calendar-alt"></i></div></div>
            <table class="summary-table"><thead><tr><th>Mês/Ano</th><th>Viagens</th><th>Total</th></tr></thead><tbody>
                ${topMeses.map(([mes, dados]) => `<tr><td>${mes}</td><td class="center">${dados.viagens}</td><td class="money">${formatarMoeda(dados.valor)}</td></tr>`).join('')}
            </tbody></table>
        </div>
    </div>`;
    elementos.contentArea.innerHTML = metricsHTML + summaryHTML;
}

function mostrarRelatorioMotoristas(resumo) {
    const gerarClick = (nome) => `onclick="abrirDetalhesMotorista('${nome}')" style="cursor:pointer"`;
    if (window.innerWidth < 768) {
        const list = resumo.motoristasOrdenados.slice(0, 10).map(([nome, d]) => 
            `<div class="mobile-card" ${gerarClick(nome)}><strong>${nome}</strong><span>${d.viagens} viagens - ${formatarMoeda(d.valor)}</span></div>`).join('');
        elementos.contentArea.innerHTML = `<h3 class="mobile-title">Motoristas</h3><div class="mobile-card-list">${list}</div>`;
        return;
    }
    elementos.contentArea.innerHTML = `
    <div class="summary-card">
        <div class="summary-header"><div class="summary-title">Resumo por Motorista</div></div>
        <table class="summary-table"><thead><tr><th>Motorista</th><th class="center">Viagens</th><th class="money">Total</th><th class="center">Detalhes</th></tr></thead><tbody>
        ${resumo.motoristasOrdenados.map(([nome, d]) => `<tr ${gerarClick(nome)}><td>${nome}</td><td class="center">${d.viagens}</td><td class="money">${formatarMoeda(d.valor)}</td><td class="center"><i class="fas fa-search"></i></td></tr>`).join('')}
        </tbody></table>
    </div>`;
}

function mostrarRelatorioVeiculos(resumo) {
    if (window.innerWidth < 768) {
        const list = resumo.veiculosOrdenados.map(([placa, d]) => 
            `<div class="mobile-card" onclick="abrirDetalhesVeiculo('${placa}')"><strong>${placa}</strong><span>${d.viagens} viagens - ${formatarMoeda(d.valor)}</span></div>`).join('');
        elementos.contentArea.innerHTML = `<h3 class="mobile-title">Veículos</h3><div class="mobile-card-list">${list}</div>`;
        return;
    }
    elementos.contentArea.innerHTML = `
    <div class="summary-card">
        <div class="summary-header"><div class="summary-title">Resumo por Veículo</div></div>
        <table class="summary-table"><thead><tr><th>Placa</th><th class="center">Viagens</th><th class="center">KM Total</th><th class="money">Total</th><th class="center">Ação</th></tr></thead><tbody>
        ${resumo.veiculosOrdenados.map(([placa, d]) => `<tr onclick="abrirDetalhesVeiculo('${placa}')" style="cursor:pointer"><td>${placa}</td><td class="center">${d.viagens}</td><td class="center">${formatarNumero(d.km)}</td><td class="money">${formatarMoeda(d.valor)}</td><td class="center"><i class="fas fa-search"></i></td></tr>`).join('')}
        </tbody></table>
    </div>`;
}

function mostrarRelatorioClientes(resumo) {
    if (window.innerWidth < 768) {
        const list = resumo.clientesOrdenados.slice(0, 10).map(([c, d]) => `<div class="mobile-card"><strong>${c}</strong><span>${d.viagens} viagens</span><span class="money">${formatarMoeda(d.valor)}</span></div>`).join('');
        elementos.contentArea.innerHTML = `<h3 class="mobile-title">Clientes</h3><div class="mobile-card-list">${list}</div>`;
        return;
    }
    elementos.contentArea.innerHTML = `
    <div class="summary-card">
        <div class="summary-header"><div class="summary-title">Resumo por Cliente</div></div>
        <table class="summary-table"><thead><tr><th>Cliente</th><th class="center">Viagens</th><th class="money">Total</th><th class="money">Média</th></tr></thead><tbody>
        ${resumo.clientesOrdenados.map(([c, d]) => `<tr><td>${c}</td><td class="center">${d.viagens}</td><td class="money">${formatarMoeda(d.valor)}</td><td class="money">${formatarMoeda(d.valor/d.viagens)}</td></tr>`).join('')}
        </tbody></table>
    </div>`;
}

function mostrarRelatorioRotas(resumo) {
    // Função auxiliar para gerar o clique seguro (codificando caracteres especiais)
    const gerarClick = (rota, km) => {
        const rotaSafe = encodeURIComponent(rota);
        // Passa a rota codificada e o KM total (ou 0 se não tiver)
        return `onclick="abrirDetalhesRota('${rotaSafe}', ${km || 0})" style="cursor:pointer"`;
    };

    // --- VERSÃO MOBILE ---
    if (window.innerWidth < 768) {
        const list = resumo.rotasOrdenadas.map(([r, d]) => 
            `<div class="mobile-card" ${gerarClick(r, d.km)}>
                <div style="display:flex; justify-content:space-between; align-items:flex-start;">
                    <strong style="flex:1; margin-right:10px;">${r}</strong>
                    <i class="fas fa-chevron-right" style="color:var(--cor-secundaria); font-size:0.9rem;"></i>
                </div>
                <div style="display:flex; justify-content:space-between; margin-top:8px; color:var(--cor-texto-sec); font-size:0.85rem;">
                    <span>${d.viagens} viagens</span>
                    <span>${formatarNumero(d.km)} km</span>
                </div>
                <div style="text-align:right; margin-top:5px;">
                    <span class="money">${formatarMoeda(d.valor)}</span>
                </div>
            </div>`
        ).join('');
        elementos.contentArea.innerHTML = `<h3 class="mobile-title">Rotas</h3><div class="mobile-card-list">${list}</div>`;
        return;
    }

    // --- VERSÃO DESKTOP ---
    elementos.contentArea.innerHTML = `
    <div class="summary-card">
        <div class="summary-header">
            <div class="summary-title">Rotas Frequentes</div>
        </div>
        <table class="summary-table">
            <thead>
                <tr>
                    <th>Rota</th>
                    <th class="center">Viagens</th>
                    <th class="center">KM Acumulado</th>
                    <th class="money">Faturamento</th>
                    <th class="center">Detalhes</th>
                </tr>
            </thead>
            <tbody>
                ${resumo.rotasOrdenadas.map(([r, d]) => `
                    <tr ${gerarClick(r, d.km)} class="hover-row">
                        <td>${r}</td>
                        <td class="center">${d.viagens}</td>
                        <td class="center">${formatarNumero(d.km)}</td>
                        <td class="money">${formatarMoeda(d.valor)}</td>
                        <td class="center"><i class="fas fa-search-plus" style="color:var(--cor-secundaria)"></i></td>
                    </tr>
                `).join('')}
            </tbody>
        </table>
    </div>`;
}

function mostrarRelatorioDiario(resumo) {
    const listaDias = resumo.diasOrdenados;
    const gerarClick = (dia) => `onclick="abrirDetalhesDia('${dia}')" style="cursor:pointer"`;
    
    if (window.innerWidth < 768) {
        const cards = listaDias.map(([dia, dados]) => {
            const dataObj = parsearDataBR(dia);
            const diaSemana = dataObj ? ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'][dataObj.getDay()] : '';
            return `
            <div class="mobile-card" ${gerarClick(dia)}>
                <div style="display:flex; justify-content:space-between; align-items:center;"><strong>${dia} <small style="font-weight:400; color:var(--cor-texto-sec); font-size:0.8rem;">(${diaSemana})</small></strong><span class="status-badge status-analise" style="font-size:0.8rem;">${dados.viagens} viagens</span></div>
                <div style="margin-top:0.5rem; text-align:right;"><span class="money" style="font-size:1.2rem;">${formatarMoeda(dados.valor)}</span><div style="font-size:0.7rem; color:var(--cor-secundaria); margin-top:2px;">Toque para ver detalhes <i class="fas fa-chevron-right"></i></div></div>
            </div>`;
        }).join('');
        elementos.contentArea.innerHTML = `<h3 class="mobile-title">Histórico Diário (${listaDias.length} dias)</h3><div class="mobile-card-list">${cards}</div>`;
        return;
    }
    
    elementos.contentArea.innerHTML = `
        <div class="summary-card">
            <div class="summary-header"><div class="summary-title">Histórico Completo por Dia</div><div class="summary-icon"><i class="fas fa-calendar-day"></i></div></div>
            <table class="summary-table"><thead><tr><th>Data</th><th class="center">Viagens</th><th class="money">Faturamento Total</th><th class="money">Média</th><th class="center">Dia da Semana</th><th class="center">Ação</th></tr></thead><tbody>
                ${listaDias.map(([dia, dados]) => {
                    const dataObj = parsearDataBR(dia);
                    const diaSemana = dataObj ? ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'][dataObj.getDay()] : '';
                    return `<tr ${gerarClick(dia)} class="hover-row"><td>${dia}</td><td class="center">${dados.viagens}</td><td class="money">${formatarMoeda(dados.valor)}</td><td class="money">${formatarMoeda(dados.valor / dados.viagens)}</td><td class="center">${diaSemana}</td><td class="center"><i class="fas fa-chart-bar" style="color:var(--cor-secundaria)"></i></td></tr>`;
                }).join('')}
            </tbody></table>
        </div>`;
}

function mostrarRelatorioKM(resumo) {
    const metricsHTML = `
        <div class="metrics-grid">
            <div class="metric-card"><div class="metric-icon"><i class="fas fa-road"></i></div><div class="metric-value">${formatarNumero(resumo.totalKM)}</div><div class="metric-label">KM Total</div></div>
            <div class="metric-card"><div class="metric-icon"><i class="fas fa-calculator"></i></div><div class="metric-value">${formatarNumero(resumo.mediaKM)}</div><div class="metric-label">KM Médio/Viagem</div></div>
            <div class="metric-card"><div class="metric-icon"><i class="fas fa-money-bill-wave"></i></div><div class="metric-value">${formatarMoeda(resumo.totalValor / (resumo.totalKM || 1))}</div><div class="metric-label">Receita por KM</div></div>
        </div>`;
    
    if (window.innerWidth < 768) {
        const topVeiculos = resumo.veiculosOrdenados.slice(0, 10);
        const listCards = topVeiculos.map(([placa, dados]) => `
            <div class="mobile-card">
                <div style="display:flex; justify-content:space-between;"><strong>${placa}</strong><span>${dados.viagens} viagens</span></div>
                <div style="display:flex; justify-content:space-between; margin-top:5px; color:var(--cor-texto-sec); font-size:0.85rem;"><span>Total: ${formatarNumero(dados.km)} km</span><span>R$ ${formatarNumero(dados.km > 0 ? dados.valor / dados.km : 0)}/km</span></div>
            </div>`).join('');
        elementos.contentArea.innerHTML = metricsHTML + `<h3 class="mobile-title" style="margin-top:1.5rem;">KM por Veículo</h3><div class="mobile-card-list">${listCards}</div>`;
        return;
    }
    
    elementos.contentArea.innerHTML = `
        <div class="summary-card">
            <div class="summary-header"><div class="summary-title">Análise de Quilometragem</div><div class="summary-icon"><i class="fas fa-road"></i></div></div>
            <div style="margin-bottom: 1.5rem;">${metricsHTML}</div>
            <h4 style="margin-bottom: 1rem; color: var(--cor-texto);">Veículos com Maior Quilometragem</h4>
            <table class="summary-table"><thead><tr><th>Veículo</th><th class="center">Viagens</th><th class="center">KM Total</th><th class="center">KM Médio</th><th class="money">Faturamento Total</th><th class="money">Receita/KM</th></tr></thead><tbody>
                ${resumo.veiculosOrdenados.slice(0, 10).map(([placa, dados]) => `
                    <tr><td>${placa}</td><td class="center">${dados.viagens}</td><td class="center">${formatarNumero(dados.km)}</td><td class="center">${formatarNumero(dados.km / dados.viagens)}</td><td class="money">${formatarMoeda(dados.valor)}</td><td class="money">${formatarMoeda(dados.km > 0 ? dados.valor / dados.km : 0)}</td></tr>`).join('')}
            </tbody></table>
        </div>`;
}

// ==========================================
// 5. MODAIS (LÓGICA E CONTROLES)
// ==========================================

// CONTROLE GLOBAL DE MODAIS (Histórico e Fechamento)
function fecharModalGlobal() {
    document.querySelectorAll('.modal-overlay').forEach(m => m.style.display = 'none');
    document.querySelectorAll('.modal-overlay-rota').forEach(m => m.style.display = 'none');
    
    if (window.history.state && window.history.state.modalOpen) {
        window.history.back();
    }
}

window.onpopstate = function(event) {
    document.querySelectorAll('.modal-overlay').forEach(m => m.style.display = 'none');
    document.querySelectorAll('.modal-overlay-rota').forEach(m => m.style.display = 'none');
};

document.addEventListener('keydown', function(event) {
    if (event.key === "Escape") {
        fecharModalGlobal();
    }
});

function abrirModalComHistorico(idModal) {
    const modal = document.getElementById(idModal);
    if(modal) {
        modal.style.display = 'flex';
        window.history.pushState({modalOpen: true}, "", "#modal");
    }
}

// Funções específicas de abrir
function abrirDetalhesDia(diaClicado) {
    if(!dadosOriginais) return;
    const cabecalho = dadosOriginais[0];
    const colunas = detectarColunas(cabecalho);
    const idxData = colunas.find(c => c.tipo === 'data')?.indice;
    const idxMotorista = colunas.find(c => c.tipo === 'motorista')?.indice;
    const idxValor = colunas.find(c => c.tipo === 'valor')?.indice;
    
    if(idxData === undefined) return alert('Erro ao identificar data');

    const registrosDia = dadosOriginais.slice(1).filter(linha => {
        const dataLinha = linha[idxData];
        if(!dataLinha) return false;
        const dObj = parsearDataBR(dataLinha);
        if(!dObj) return false;
        return dObj.toLocaleDateString('pt-BR') === diaClicado;
    });

    const porMotorista = {};
    let totalDia = 0;
    
    registrosDia.forEach(linha => {
        const mot = linha[idxMotorista] || 'Indefinido';
        const val = extrairNumero(linha[idxValor]);
        if(!porMotorista[mot]) porMotorista[mot] = { valor: 0, viagens: 0 };
        porMotorista[mot].valor += val;
        porMotorista[mot].viagens++;
        totalDia += val;
    });

    const arrayMotoristas = Object.entries(porMotorista).sort((a,b) => b[1].valor - a[1].valor);
    document.getElementById('tituloModalDia').textContent = `Resumo: ${diaClicado}`;
    document.getElementById('modalSubtitulo').textContent = `${registrosDia.length} viagens totais | ${formatarMoeda(totalDia)}`;

    const listaHTML = arrayMotoristas.map(([nome, dados]) => `
        <div class="driver-list-item">
            <div><strong style="color:var(--cor-primaria)">${nome}</strong><br><small style="color:var(--cor-texto-sec)">${dados.viagens} viagens</small></div>
            <div class="money" style="color:var(--cor-secundaria)">${formatarMoeda(dados.valor)}</div>
        </div>`).join('');
    document.getElementById('modalListaMotoristas').innerHTML = listaHTML;
    gerarGraficoModal(arrayMotoristas);
    abrirModalComHistorico('modalDia');
}

function gerarGraficoModal(dadosMotoristas) {
    const ctx = document.getElementById('graficoDia').getContext('2d');
    if(chartInstance) chartInstance.destroy();
    const labels = dadosMotoristas.map(d => d[0].split(' ')[0]);
    const valores = dadosMotoristas.map(d => d[1].valor);
    const viagens = dadosMotoristas.map(d => d[1].viagens);
    const maiorValor = Math.max(...valores);
    const tetoGrafico = maiorValor > 0 ? maiorValor * 1.2 : 100;
    const isDark = document.body.classList.contains('dark');
    const corTexto = isDark ? '#e9ecef' : '#1f2933';

    chartInstance = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{ data: valores, backgroundColor: '#FF6B35', hoverBackgroundColor: '#e55a2b', borderRadius: 4, barPercentage: 0.6, categoryPercentage: 0.8 }]
        },
        plugins: [ChartDataLabels],
        options: {
            responsive: true, maintainAspectRatio: false,
            layout: { padding: { top: 30, left: 10, right: 10, bottom: 10 } },
            plugins: {
                legend: { display: false },
                tooltip: { callbacks: { label: (ctx) => `${formatarMoeda(ctx.raw)} (${viagens[ctx.dataIndex]} viagens)` } },
                datalabels: { align: 'end', anchor: 'end', formatter: (value) => value.toLocaleString('pt-BR', {style: 'currency', currency: 'BRL'}), color: corTexto, font: { weight: 'bold', size: 11 }, offset: 4 }
            },
            scales: {
                y: { display: false, beginAtZero: true, max: tetoGrafico, grid: { display: false } },
                x: { grid: { display: false }, ticks: { color: corTexto, font: { size: 11, weight: '500' } } }
            }
        }
    });
}

function abrirDetalhesMotorista(nomeMotorista) {
    if(!dadosAnalisados) return;
    const dadosMot = dadosAnalisados.motoristas[nomeMotorista];
    if(!dadosMot) return alert('Dados não encontrados para este motorista.');
    const faturamento = dadosMot.valor;
    const kmTotal = dadosMot.km;
    const litros = kmTotal > 0 ? kmTotal / CUSTOS.CONSUMO_MEDIO : 0;
    const custoDiesel = litros * CUSTOS.DIESEL_PRECO;
    const lucroOperacional = faturamento - custoDiesel;

    document.getElementById('modalMotTitulo').textContent = nomeMotorista;
    document.getElementById('motFaturamento').textContent = formatarMoeda(faturamento);
    document.getElementById('motKm').textContent = formatarNumero(kmTotal) + ' km';
    document.getElementById('motCustoDiesel').textContent = `- ${formatarMoeda(custoDiesel)}`;
    const elLucro = document.getElementById('motLucro');
    elLucro.textContent = formatarMoeda(lucroOperacional);
    elLucro.style.color = lucroOperacional >= 0 ? 'var(--cor-pago)' : '#dc3545';
    abrirModalComHistorico('modalMotorista');
}

// ------------------------------------
// ABRIR VEÍCULO (COM VISUAL DE LISTA LIMPA)
// ------------------------------------
function abrirDetalhesVeiculo(placa) {
    if (!dadosAnalisados || !dadosAnalisados.veiculos[placa]) {
        alert("Dados não encontrados.");
        return;
    }
    try {
        const d = dadosAnalisados.veiculos[placa];
        
        // 1. DADOS ESTIMADOS
        const faturamento = d.valor;
        const kmTotalEstimado = d.km;
        const litrosEstimados = kmTotalEstimado > 0 ? kmTotalEstimado / CUSTOS.CONSUMO_MEDIO : 0;
        const custoDieselEstimado = litrosEstimados * CUSTOS.DIESEL_PRECO;
        const custoManutencao = faturamento * CUSTOS.MANUTENCAO_PCT;
        const lucroLiquidoEstimado = faturamento - custoDieselEstimado - custoManutencao;

        // 2. DADOS REAIS (COMBUSTÍVEL)
        let litrosDieselReal = 0;
        let valorDieselReal = 0;
        let litrosArlaReal = 0;
        let valorArlaReal = 0;
        let encontrouDadosReais = false;

        // FILTRO DE DATA
        const inicioInput = document.getElementById('dataInicio').value;
        const fimInput = document.getElementById('dataFim').value;
        
        let dInicio = inicioInput ? new Date(inicioInput + 'T00:00:00') : new Date(1900, 0, 1);
        let dFim = fimInput ? new Date(fimInput + 'T23:59:59') : new Date(2100, 0, 1);

        if (dadosCombustivelOriginais && dadosCombustivelOriginais.length > 1) {
            const idxC = { placa: 0, data: 1, litros: 3, tipo: 6, valor: 7 };

            dadosCombustivelOriginais.slice(1).forEach(linha => {
                const placaLinha = String(linha[idxC.placa] || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
                const placaAlvo = placa.toUpperCase().replace(/[^A-Z0-9]/g, '');

                if (placaLinha === placaAlvo) {
                    const dataReal = parsearDataBR(linha[idxC.data]);
                    if (dataReal && dataReal >= dInicio && dataReal <= dFim) {
                        encontrouDadosReais = true;
                        
                        const qtd = extrairNumero(linha[idxC.litros]);
                        const vlr = extrairNumero(linha[idxC.valor]);
                        const tipo = String(linha[idxC.tipo] || '').toUpperCase();

                        if (tipo.includes('ARLA')) {
                            litrosArlaReal += qtd;
                            valorArlaReal += vlr;
                        } else {
                            litrosDieselReal += qtd;
                            valorDieselReal += vlr;
                        }
                    }
                }
            });
        }

        // 3. ATUALIZAR TELA
        document.getElementById('textoPlaca').textContent = placa;
        document.getElementById('modalFaturamento').textContent = formatarMoeda(faturamento);
        document.getElementById('modalKM').textContent = formatarNumero(kmTotalEstimado) + ' km';
        document.getElementById('modalCustoCombustivel').textContent = `- ${formatarMoeda(custoDieselEstimado)}`;
        document.getElementById('modalCustoManutencao').textContent = `- ${formatarMoeda(custoManutencao)}`;
        const elLucroLiq = document.getElementById('modalLucroLiquido');
        elLucroLiq.textContent = formatarMoeda(lucroLiquidoEstimado);
        elLucroLiq.style.color = lucroLiquidoEstimado >= 0 ? 'var(--cor-pago)' : '#dc3545';

        // 4. ATUALIZAR HTML DOS DADOS REAIS (LISTA LIMPA)
        const elRealContainer = document.getElementById('containerDadosReais');
        if (encontrouDadosReais) {
            if(elRealContainer) {
                elRealContainer.style.display = 'block';
                elRealContainer.style.background = 'transparent';
                elRealContainer.style.border = 'none';
                elRealContainer.style.padding = '0';

                // Usando a classe driver-list-item para manter consistência com o modal diário
                elRealContainer.innerHTML = `
                <h4 style="font-size: 0.9rem; color: var(--cor-primaria); margin: 1.5rem 0 0.5rem 0.5rem; border-left: 3px solid var(--cor-secundaria); padding-left: 8px;">
                    Consumo Real (Abastecimentos)
                </h4>
                
                <div style="background: var(--cor-fundo-menu); border-radius: 8px; border: 1px solid var(--cor-borda); overflow: hidden;">
                    <div class="driver-list-item" style="display: flex; justify-content: space-between; align-items: center; padding: 0.8rem; border-bottom: 1px solid var(--cor-borda);">
                        <div>
                            <strong style="color:var(--cor-primaria); font-size: 0.95rem;">DIESEL S-10</strong><br>
                            <small style="color:var(--cor-texto-sec); font-size: 0.8rem;">${formatarNumero(litrosDieselReal)} Litros</small>
                        </div>
                        <div class="money" style="color: #dc3545; font-size: 1rem;">- ${formatarMoeda(valorDieselReal)}</div>
                    </div>

                    <div class="driver-list-item" style="display: flex; justify-content: space-between; align-items: center; padding: 0.8rem;">
                        <div>
                            <strong style="color:var(--cor-primaria); font-size: 0.95rem;">ARLA 32</strong><br>
                            <small style="color:var(--cor-texto-sec); font-size: 0.8rem;">${formatarNumero(litrosArlaReal)} Litros</small>
                        </div>
                        <div class="money" style="color: #dc3545; font-size: 1rem;">- ${formatarMoeda(valorArlaReal)}</div>
                    </div>
                </div>`;
            }
        } else {
            if(elRealContainer) elRealContainer.style.display = 'none';
        }

        // Lógica Motorista/Rota
        let motoristaPrincipal = "---";
        let rotaPrincipal = "---";
        if(dadosOriginais && indiceColunaData !== null) {
             let viagensFiltradas = dadosOriginais.slice(1).filter(linha => {
                 const dt = parsearDataBR(linha[indiceColunaData]);
                 return dt >= dInicio && dt <= dFim && linha.toString().includes(placa);
             });
             const cols = detectColumnsGlobal(dadosOriginais[0]); 
             const contMot = {};
             const contRota = {};
             viagensFiltradas.forEach(v => {
                 if(cols.motorista !== undefined) { const m = v[cols.motorista] || 'Desconhecido'; contMot[m] = (contMot[m] || 0) + 1; }
                 if(cols.origem !== undefined && cols.destino !== undefined) { const r = `${v[cols.origem]} -> ${v[cols.destino]}`; contRota[r] = (contRota[r] || 0) + 1; }
             });
             const sortMot = Object.entries(contMot).sort((a,b)=>b[1]-a[1]);
             if(sortMot.length > 0) motoristaPrincipal = `${sortMot[0][0]} (${Math.round(sortMot[0][1]/viagensFiltradas.length*100)}%)`;
             const sortRota = Object.entries(contRota).sort((a,b)=>b[1]-a[1]);
             if(sortRota.length > 0) rotaPrincipal = sortRota[0][0];
        }
        document.getElementById('textoMotoristaVeiculo').textContent = motoristaPrincipal;
        document.getElementById('textoRotaVeiculo').textContent = rotaPrincipal;
        document.getElementById('modalMedia').textContent = formatarMoeda(d.viagens > 0 ? faturamento/d.viagens : 0);

        abrirModalComHistorico('modalVeiculo');
    } catch (e) {
        console.error("Erro detalhes veiculo", e);
        alert("Erro: " + e.message);
    }
}

// Funções de Fechar (Redirecionam para o Global)
function fecharModalMotorista() { fecharModalGlobal(); }
function fecharModal() { fecharModalGlobal(); }
function fecharModalVeiculo() { fecharModalGlobal(); }
function fecharModalRota() { fecharModalGlobal(); }

// Rota e Pedágio
function calcularCustoPedagio(destino) {
    let destLimpo = String(destino || "").toUpperCase();
    if (destLimpo.includes('→')) { destLimpo = destLimpo.split('→')[1] || destLimpo; }
    destLimpo = destLimpo.trim(); 
    let custo = 0;
    let detalhes = [];
    if (destLimpo.includes('CABO FRIO') || destLimpo.includes('BUZIOS') || destLimpo.includes('ARRAIAL') || destLimpo.includes('SAO PEDRO') || destLimpo.includes('IGUABA')) {
        custo += CUSTO_PEDAGIOS.VIA_LAGOS;
        detalhes.push(`Via Lagos (${formatarMoeda(CUSTO_PEDAGIOS.VIA_LAGOS)})`);
    }
    if (destLimpo.includes('MACAE') || destLimpo.includes('RIO DAS OSTRAS') || destLimpo.includes('CAMPOS') || destLimpo.includes('CASIMIRO')) {
        custo += CUSTO_PEDAGIOS.AUTOPISTA_FLUMINENSE;
        detalhes.push(`Praça BR-101 (R$ ${formatarMoeda(CUSTO_PEDAGIOS.AUTOPISTA_FLUMINENSE)})`);
    }
    if (destLimpo.includes('RIO DE JANEIRO') || destLimpo.includes('NITEROI') || destLimpo.includes('SAO GONCALO') || destLimpo.includes('ITABORAI') || destLimpo.includes('DUQUE')) {
        custo += CUSTO_PEDAGIOS.AUTOPISTA_FLUMINENSE; 
        detalhes.push(`Pedágio Manilha (R$ ${formatarMoeda(CUSTO_PEDAGIOS.AUTOPISTA_FLUMINENSE)})`);
        if(destLimpo.includes('RIO DE JANEIRO') || destLimpo.includes('DUQUE')) {
            custo += CUSTO_PEDAGIOS.PONTE_RIO_NITEROI;
            detalhes.push(`Ponte Rio-Niterói (R$ ${formatarMoeda(CUSTO_PEDAGIOS.PONTE_RIO_NITEROI)})`);
        }
    }
    if (custo === 0) { detalhes.push("Rota local ou sem pedágio mapeado"); }
    return { total: custo, lista: detalhes };
}

window.abrirDetalhesRota = function(rotaCodificada, kmTotal) {
    try {
        // 1. Decodificar e Calcular
        const destinoBruto = decodeURIComponent(rotaCodificada);
        const destinoNome = destinoBruto.replace(/.*→/, '').trim(); 
        const infoPedagio = calcularCustoPedagio(destinoNome);
        
        // 2. Selecionar o NOVO modal e o corpo dele
        const modalContainer = document.getElementById('modalRotaContainer');
        const cardBody = modalContainer.querySelector('.card-body');
        
        if (!modalContainer || !cardBody) {
            console.error("Modal de rota não encontrado no HTML");
            return;
        }

        // 3. Gerar as Badges de Pedágio
        const badgesHtml = infoPedagio.lista.map(item => 
            `<span class="toll-badge"><i class="fas fa-ticket-alt"></i> ${item}</span>`
        ).join('');

        // 4. Criar o HTML Novo Dinamicamente (Usando seu CSS novo)
        const htmlConteudo = `
            <div class="route-timeline">
                <div class="route-point">
                    <div class="point-icon origin"><i class="fas fa-industry"></i></div>
                    <div class="point-content">
                        <strong>Areal Tosana</strong>
                        <small>Origem Fixa</small>
                    </div>
                </div>

                <div class="route-path">
                    <div class="path-line"></div>
                    <div class="toll-info">
                        ${badgesHtml || '<span class="toll-badge" style="background:#eee; color:#666">Sem pedágio</span>'}
                    </div>
                </div>

                <div class="route-point">
                    <div class="point-icon dest"><i class="fas fa-map-marker-alt"></i></div>
                    <div class="point-content">
                        <strong>${destinoNome}</strong>
                        <small>Destino Final</small>
                    </div>
                </div>
            </div>

            <div class="route-summary-box" style="margin-top: 1rem;">
                <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
                    <span><i class="fas fa-road"></i> Distância Aprox.</span>
                    <strong>${formatarNumero(kmTotal)} km</strong>
                </div>
                <div style="display: flex; justify-content: space-between; align-items: center;">
                    <span><i class="fas fa-ticket-alt"></i> Custo Pedágio (Est.)</span>
                    <strong style="color: ${infoPedagio.total > 0 ? '#dc3545' : '#28a745'}">
                        ${formatarMoeda(infoPedagio.total)}
                    </strong>
                </div>
            </div>
        `;

        // 5. Injetar o HTML e Abrir
        cardBody.innerHTML = htmlConteudo;
        
        // Usa sua função global de abrir modal ou exibe direto
        modalContainer.style.display = 'flex'; 
        
        // Opcional: Se quiser usar o histórico do navegador (botão voltar do celular)
        if(typeof abrirModalComHistorico === 'function') {
           // Se sua função abrirModalComHistorico apenas muda o display, ok.
           // Se ela faz mais coisas, chame ela aqui.
           // Mas como já demos o display flex acima, garantimos que abre.
           window.history.pushState({modalOpen: true}, "", "#rota");
        }

    } catch (erro) { 
        console.error("Erro ao abrir rota:", erro); 
        alert("Erro ao carregar detalhes da rota.");
    }
}

function fecharModalRota() {
    document.getElementById('modalRotaContainer').style.display = 'none';
    if(document.getElementById('modalRota')) document.getElementById('modalRota').style.display = 'none';
}

// ==========================================
// 6. FUNÇÕES PRINCIPAIS (AGORA DEFINIDAS)
// ==========================================

// Esta função estava faltando e causava o erro ao clicar no botão de filtro
function aplicarFiltroData() {
    if (!dadosOriginais) { mostrarNotificacao('❌ Dados ainda não carregados', 'error'); return; }
    if (indiceColunaData === null) { mostrarNotificacao('❌ Coluna de data não encontrada', 'error'); return; }
    
    const inicio = document.getElementById('dataInicio').value;
    const fim = document.getElementById('dataFim').value;
    
    if (!inicio || !fim) { mostrarNotificacao('⚠️ Selecione as duas datas', 'error'); return; }
    
    // === INICIO DA CORREÇÃO ===
    // Força a interpretação como horário LOCAL, ignorando o fuso UTC
    const [anoI, mesI, diaI] = inicio.split('-').map(Number);
    const dataInicio = new Date(anoI, mesI - 1, diaI, 0, 0, 0, 0);

    const [anoF, mesF, diaF] = fim.split('-').map(Number);
    const dataFim = new Date(anoF, mesF - 1, diaF, 23, 59, 59, 999);
    // === FIM DA CORREÇÃO ===
    
    const cabecalho = dadosOriginais[0];
    const linhas = dadosOriginais.slice(1);
    
    const linhasFiltradas = linhas.filter(linha => {
        const data = parsearDataBR(linha[indiceColunaData]);
        // A comparação agora funcionará pois ambos estão no mesmo fuso horário
        return data && data >= dataInicio && data <= dataFim;
    });
    
    if (!linhasFiltradas.length) { mostrarNotificacao('⚠️ Nenhum registro no período', 'error'); return; }
    
    dadosAnalisados = analisarDadosMineramix([cabecalho, ...linhasFiltradas]);
    const itemAtivo = document.querySelector('.menu-item.active');
    const relatorioAtual = itemAtivo ? itemAtivo.getAttribute('data-report') : 'overview';
    mostrarRelatorio(relatorioAtual);
    mostrarNotificacao(`📅 Período aplicado: ${linhasFiltradas.length} registros`, 'success');
}

// Esta função estava faltando e causava o erro ao clicar no botão de plug
async function testarConexao() {
    try {
        atualizarStatus(false, '🔄 Testando conexão...');
        const resposta = await fetch(CONFIG.API_URL);
        if (resposta.ok) {
            atualizarStatus(true, '✅ Conexão estabelecida');
            mostrarNotificacao('✅ Conexão com o servidor bem-sucedida!', 'success');
        } else { throw new Error(`Erro ${resposta.status}`); }
    } catch (erro) {
        atualizarStatus(false, `❌ Falha na conexão: ${erro.message}`);
        mostrarNotificacao('❌ Não foi possível conectar ao servidor', 'error');
    }
}

async function carregarDados() {
    try {
        atualizarStatus(false, '🔄 Conectando...');
        const resposta = await fetch(CONFIG.API_URL);
        const resultado = await resposta.json();
        
        dadosOriginais = resultado.dados;
        dadosCombustivelOriginais = resultado.dadosCombustivel;
        
        const cabecalhos = dadosOriginais[0];
        const colunasDetectadas = detectarColunas(cabecalhos);
        const colunaData = colunasDetectadas.find(c => c.tipo === 'data');
        indiceColunaData = colunaData ? colunaData.indice : null;
        
        dadosAnalisados = analisarDadosMineramix(dadosOriginais);
        mostrarRelatorio('overview');
        atualizarStatus(true, `✅ Online`);
    } catch (erro) {
        console.error(erro);
        atualizarStatus(false, `❌ Erro`);
    }
}

document.addEventListener('DOMContentLoaded', function() {
    const menuItems = document.querySelectorAll('.menu-item');
    menuItems.forEach(item => {
        item.addEventListener('click', function() {
            const report = this.getAttribute('data-report');
            if (report) mostrarRelatorio(report);
            if (this.id === 'btn-refresh') carregarDados();
        });
    });
    if (localStorage.getItem('darkMode') === 'on') toggleDarkMode();
    setTimeout(() => { carregarDados(); testarConexao(); }, 1000);
});

// Fechar modais ao clicar fora (ATUALIZADO)
window.onclick = function(event) {
    if (event.target.classList.contains('modal-overlay') || event.target.classList.contains('modal-overlay-rota')) {
        fecharModalGlobal();
    }
}

// === EXPORTAÇÃO GLOBAL CRUCIAL ===
// Isso garante que os botões HTML encontrem as funções
window.fecharModalVeiculo = fecharModalVeiculo;
window.abrirDetalhesVeiculo = abrirDetalhesVeiculo;
window.abrirDetalhesMotorista = abrirDetalhesMotorista;
window.fecharModal = fecharModal;
window.fecharModalMotorista = fecharModalMotorista;
window.abrirDetalhesDia = abrirDetalhesDia;
window.aplicarFiltroData = aplicarFiltroData; // <--- AGORA VAI FUNCIONAR
window.carregarDados = carregarDados;
window.testarConexao = testarConexao; // <--- AGORA VAI FUNCIONAR
window.toggleDarkMode = toggleDarkMode;
window.fecharModalRota = fecharModalRota;
