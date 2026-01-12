// Adicione isso no topo do app.js
const CUSTOS = {
    DIESEL_PRECO: 6.00,
    CONSUMO_MEDIO: 2.0, // km/L
    MANUTENCAO_PCT: 0.12 // 12% sobre o faturamento
};

// Configuração
const CONFIG = {
    API_URL: 'https://dashboard-mineramix-backend.onrender.com/api/dados'
};

// ==========================================
// CONFIGURAÇÃO DE PEDÁGIOS (BR-101 / VIA LAGOS)
// ==========================================
const CUSTO_PEDAGIOS = {
    'AUTOPISTA_FLUMINENSE': 6.90, // Pedágio BR-101
    'VIA_LAGOS': 27.00,           // Pedágio Via Lagos
    'PONTE_RIO_NITEROI': 6.20,
    'OUTROS': 0.00
};

// Variáveis globais
let dadosAnalisados = null;
let dadosOriginais = null;
let indiceColunaData = null;

// Elementos
const elementos = {
    contentArea: document.getElementById('contentArea'),
    reportTitle: document.getElementById('reportTitle'),
    reportSubtitle: document.getElementById('reportSubtitle'),
    statusText: document.getElementById('statusText'),
    statusDot: document.getElementById('statusDot'),
    lastUpdate: document.getElementById('lastUpdate'),
};

// ========== FUNÇÕES DE ANÁLISE ESPECÍFICA ==========

function detectarColunas(cabecalhos) {
    console.log("🔍 Cabeçalhos recebidos:", cabecalhos);
    const mapeamento = {};
    cabecalhos.forEach((cabecalho, index) => {
        const cabecalhoLower = cabecalho.toString().toLowerCase().trim();
        if (cabecalhoLower.includes('data') && !cabecalhoLower.includes('pgto')) {
            mapeamento['DATA'] = { indice: index, tipo: 'data' };
        } else if (cabecalhoLower.includes('cliente')) {
            mapeamento['CLIENTE'] = { indice: index, tipo: 'cliente' };
        } else if (cabecalhoLower.includes('motorista')) {
            mapeamento['MOTORISTA'] = { indice: index, tipo: 'motorista' };
        } else if (cabecalhoLower.includes('placa') || cabecalhoLower.includes('veículo') || cabecalhoLower.includes('cavalo')) {
            mapeamento['PLACA'] = { indice: index, tipo: 'veiculo' };
        } else if (cabecalhoLower.includes('origem')) {
            mapeamento['ORIGEM'] = { indice: index, tipo: 'origem' };
        } else if (cabecalhoLower.includes('destino')) {
            mapeamento['DESTINO'] = { indice: index, tipo: 'destino' };
        } else if (cabecalhoLower.includes('km') || cabecalhoLower.includes('quilometragem')) {
            mapeamento['KM'] = { indice: index, tipo: 'km' };
        } else if (cabecalhoLower.includes('valor') || cabecalhoLower.includes('total') || cabecalhoLower.includes('preço')) {
            mapeamento['VALOR'] = { indice: index, tipo: 'valor' };
        } else if (cabecalhoLower.includes('forma') && cabecalhoLower.includes('pgto')) {
            mapeamento['FORMA_PGTO'] = { indice: index, tipo: 'pagamento' };
        } else if (cabecalhoLower.includes('status')) {
            mapeamento['STATUS'] = { indice: index, tipo: 'status' };
        }
    });
    const colunas = [];
    Object.keys(mapeamento).forEach(nome => {
        colunas.push({ nome: nome, indice: mapeamento[nome].indice, tipo: mapeamento[nome].tipo });
    });
    return colunas;
}

function extrairNumero(texto) {
    if (!texto) return 0;
    const limpo = texto.toString().replace('R$', '').replace(/\./g, '').replace(',', '.').replace(/[^\d.-]/g, '').trim();
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
    } catch (e) {
        return null;
    }
}

function analisarDadosMineramix(dados) {
    if (!dados || dados.length < 5) return null;
    let indiceCabecalho = -1;
    for (let i = 0; i < 10; i++) {
        const linhaStr = dados[i].join(' ').toUpperCase();
        if (linhaStr.includes('DATA') && linhaStr.includes('MOTORISTA')) {
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
        if (!dataRaw || dataRaw.toString().trim() === '') continue;
        const dataObj = parsearDataBR(dataRaw);
        if (!dataObj) continue;

        const valor = idx.valor !== undefined ? extrairNumero(linha[idx.valor]) : 0;
        const km = idx.km !== undefined ? extrairNumero(linha[idx.km]) : 0;
        let motorista = idx.motorista !== undefined ? linha[idx.motorista] : 'NÃO IDENTIFICADO';
        if (!motorista || motorista.toString().trim() === '') motorista = 'NÃO IDENTIFICADO';

        resumo.totalLinhas++;
        resumo.totalValor += valor;
        resumo.totalKM += km;
        resumo.valores.push(valor);
        resumo.kms.push(km);

        const cliente = idx.cliente !== undefined ? linha[idx.cliente] : 'Não informado';
        const veiculo = idx.veiculo !== undefined ? linha[idx.veiculo] : 'Não informado';
        const origem = idx.origem !== undefined ? linha[idx.origem] : '';
        const destino = idx.destino !== undefined ? linha[idx.destino] : '';
        const status = idx.status !== undefined ? linha[idx.status] : 'Não informado';

        if (!resumo.motoristas[motorista]) resumo.motoristas[motorista] = { viagens: 0, valor: 0, km: 0 };
        resumo.motoristas[motorista].viagens++; resumo.motoristas[motorista].valor += valor; resumo.motoristas[motorista].km += km;

        if (!resumo.veiculos[veiculo]) resumo.veiculos[veiculo] = { viagens: 0, valor: 0, km: 0 };
        resumo.veiculos[veiculo].viagens++; resumo.veiculos[veiculo].valor += valor; resumo.veiculos[veiculo].km += km;

        if (!resumo.clientes[cliente]) resumo.clientes[cliente] = { viagens: 0, valor: 0 };
        resumo.clientes[cliente].viagens++; resumo.clientes[cliente].valor += valor;

        if (!resumo.status[status]) resumo.status[status] = { viagens: 0, valor: 0 };
        resumo.status[status].viagens++; resumo.status[status].valor += valor;

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

// ========== FUNÇÕES DE VISUALIZAÇÃO ==========

function formatarMoeda(valor) {
    return 'R$ ' + valor.toFixed(2).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}
function formatarNumero(numero) {
    return numero.toFixed(0).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}
function atualizarStatus(online, mensagem) {
    elementos.statusText.textContent = mensagem;
    elementos.statusDot.className = online ? 'status-dot online' : 'status-dot offline';
}

function mostrarRelatorio(tipo) {
    if (!dadosAnalisados) {
        elementos.contentArea.innerHTML = `<div class="loading"><i class="fas fa-exclamation-triangle"></i><p>Nenhum dado disponível. Clique em "Atualizar".</p></div>`;
        return;
    }
    const resumo = dadosAnalisados;
    const titulos = {
        overview: 'Visão Geral', status: 'Análise por Status', pagamento: 'Formas de Pagamento',
        motoristas: 'Resumo por Motorista', veiculos: 'Resumo por Veículo', clientes: 'Resumo por Cliente',
        rotas: 'Rotas Mais Frequentes', diario: 'Análise Diária', km: 'Análise de Quilometragem'
    };
    if (elementos.reportTitle) elementos.reportTitle.textContent = titulos[tipo] || 'Dashboard Mineramix';
    if (elementos.reportSubtitle) elementos.reportSubtitle.textContent = `${resumo.totalLinhas} viagens analisadas | ${formatarMoeda(resumo.totalValor)} total`;

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
        </div>
    `;
    elementos.contentArea.innerHTML = metricsHTML + summaryHTML;
}

function mostrarRelatorioMotoristas(resumo) {
    const gerarClick = (nome) => `onclick="abrirDetalhesMotorista('${nome}')" style="cursor:pointer"`;
    if (window.innerWidth < 768) {
        const lista = resumo.motoristasOrdenados.slice(0, 10);
        const cards = lista.map(([nome, dados]) => `
            <div class="mobile-card" ${gerarClick(nome)}>
                <div style="display:flex; justify-content:space-between;"><strong>${nome}</strong><span class="status-badge status-analise">${dados.viagens} viagens</span></div>
                <div style="display:flex; justify-content:space-between; margin-top:5px; align-items:flex-end;">
                     <div style="font-size:0.85rem; color:var(--cor-texto-sec);">KM Total: ${formatarNumero(dados.km)}</div>
                     <div style="text-align:right;"><span class="money" style="font-size:1.2rem; display:block;">${formatarMoeda(dados.valor)}</span><small style="font-size:0.7rem; color:var(--cor-secundaria);">Ver Raio-X <i class="fas fa-chevron-right"></i></small></div>
                </div>
            </div>`).join('');
        elementos.contentArea.innerHTML = `<h3 class="mobile-title">Motoristas (Toque para ver lucros)</h3><div class="mobile-card-list">${cards}</div>`;
        return;
    }
    elementos.contentArea.innerHTML = `
        <div class="summary-card">
            <div class="summary-header"><div class="summary-title">Resumo Faturamento por Motorista</div><div class="summary-icon"><i class="fas fa-user-tie"></i></div></div>
            <table class="summary-table">
                <thead><tr><th>Motorista</th><th class="center">Viagens</th><th class="center">KM Total</th><th class="money">Faturamento Total</th><th class="money">Média/Viagem</th><th class="money">Renda/KM</th><th class="center">Detalhes</th></tr></thead>
                <tbody>${resumo.motoristasOrdenados.map(([nome, dados]) => `
                    <tr ${gerarClick(nome)} class="hover-row">
                        <td>${nome}</td><td class="center">${dados.viagens}</td><td class="center">${formatarNumero(dados.km)}</td><td class="money">${formatarMoeda(dados.valor)}</td><td class="money">${formatarMoeda(dados.valor / dados.viagens)}</td><td class="money">${formatarMoeda(dados.km > 0 ? dados.valor / dados.km : 0)}/km</td><td class="center"><i class="fas fa-file-invoice-dollar" style="color:var(--cor-secundaria)"></i></td>
                    </tr>`).join('')}</tbody>
            </table>
        </div>`;
}

function mostrarRelatorioVeiculos(resumo) {
    const isMobile = window.innerWidth < 768;
    if (isMobile) {
        let html = `<h3 class="mobile-title">Veículos (Toque para ver Detalhes)</h3><div class="mobile-card-list">`;
        html += resumo.veiculosOrdenados.map(([placa, d]) => `
            <div class="mobile-card" onclick="abrirDetalhesVeiculo('${placa}')" style="border-left: 4px solid var(--cor-primaria);">
                <div style="display:flex; justify-content:space-between; align-items:center;"><strong style="color:var(--cor-primaria); font-size:1.1rem;">${placa}</strong><span class="status-badge" style="background:rgba(0,0,0,0.05); color:var(--cor-texto-sec);">${d.viagens} viagens</span></div>
                <div style="display:flex; justify-content:space-between; margin-top:8px; color:var(--cor-texto-sec); font-size:0.9rem;"><span>${formatarNumero(d.km)} km</span><span class="money" style="color:var(--cor-pago); font-weight:bold; font-size:1.1rem;">${formatarMoeda(d.valor)}</span></div>
            </div>`).join('');
        html += `</div>`;
        elementos.contentArea.innerHTML = html;
        return;
    }
    let html = `
    <div class="summary-card" style="overflow-x: auto;">
        <div class="summary-header"><div class="summary-title">Resumo Faturamento por Veículo</div><div class="summary-icon" style="background:rgba(255,107,53,0.1); color:#FF6B35; width:32px; height:32px; display:flex; align-items:center; justify-content:center; border-radius:4px;"><i class="fas fa-truck"></i></div></div>
        <table class="summary-table" style="width: 100%; border-collapse: collapse; min-width: 800px;">
            <thead><tr><th style="text-align: left; padding: 12px;">Placa</th><th class="center" style="padding: 12px;">Viagens</th><th class="center" style="padding: 12px;">KM Total</th><th class="money" style="padding: 12px;">Faturamento Total</th><th class="money" style="padding: 12px;">Média/Viagem</th><th class="money" style="padding: 12px;">Renda/KM</th><th class="center" style="padding: 12px;">Ação</th></tr></thead>
            <tbody>`;
    html += resumo.veiculosOrdenados.map(([placa, d]) => `
        <tr onclick="abrirDetalhesVeiculo('${placa}')" style="cursor:pointer; transition: background 0.2s;" onmouseover="this.style.background='rgba(0,0,0,0.02)'" onmouseout="this.style.background='transparent'">
            <td style="padding: 12px; font-weight:bold;">${placa}</td><td class="center" style="padding: 12px;">${d.viagens}</td><td class="center" style="padding: 12px;">${formatarNumero(d.km)}</td><td class="money" style="padding: 12px;">${formatarMoeda(d.valor)}</td><td class="money" style="padding: 12px;">${formatarMoeda(d.valor / d.viagens)}</td><td class="money" style="padding: 12px;">${formatarMoeda(d.km > 0 ? d.valor / d.km : 0)}/km</td><td class="center" style="padding: 12px;"><i class="fas fa-search-plus" style="color:var(--cor-primaria);"></i></td>
        </tr>`).join('');
    html += `</tbody></table></div>`;
    elementos.contentArea.innerHTML = html;
}

function mostrarRelatorioClientes(resumo) {
    if (window.innerWidth < 768) {
        const lista = resumo.clientesOrdenados.slice(0, 10);
        const cards = lista.map(([cliente, dados]) => `
            <div class="mobile-card"><strong>${cliente}</strong>
                <div style="display:flex; justify-content:space-between;"><span>Viagens: ${dados.viagens}</span><span>Ticket: ${formatarMoeda(dados.valor / dados.viagens)}</span></div>
                <span class="money" style="font-size: 1.1rem; color: var(--cor-secundaria);">${formatarMoeda(dados.valor)}</span>
            </div>`).join('');
        elementos.contentArea.innerHTML = `<h3 class="mobile-title">Resumo por Cliente</h3><div class="mobile-card-list">${cards}</div>`;
        return;
    }
    elementos.contentArea.innerHTML = `
        <div class="summary-card">
            <div class="summary-header"><div class="summary-title">Resumo por Cliente</div><div class="summary-icon"><i class="fas fa-users"></i></div></div>
            <table class="summary-table"><thead><tr><th>Cliente</th><th class="center">Viagens</th><th class="money">Faturamento Total</th><th class="center">% do Total</th><th class="money">Média por Viagem</th><th class="center">Ticket Médio</th></tr></thead><tbody>
                ${resumo.clientesOrdenados.map(([cliente, dados]) => `
                    <tr><td>${cliente}</td><td class="center">${dados.viagens}</td><td class="money">${formatarMoeda(dados.valor)}</td><td class="center">${((dados.valor / resumo.totalValor) * 100).toFixed(1)}%</td><td class="money">${formatarMoeda(dados.valor / dados.viagens)}</td><td class="money">${formatarMoeda(dados.valor / dados.viagens)}</td></tr>`).join('')}
            </tbody></table>
        </div>`;
}

// Relatório de Rotas (CORRIGIDO)
function mostrarRelatorioRotas(resumo) {
    // VERSÃO MOBILE
    if (window.innerWidth < 768) {
        const lista = resumo.rotasOrdenadas; 

        const cards = lista.map(([rota, dados]) => `
            <div class="mobile-card">
                <strong style="font-size: 0.9rem;">${rota}</strong>
                <div style="display:flex; justify-content:space-between; margin-top:5px;">
                    <span>Viagens: ${dados.viagens}</span>
                    <span>KM Médio: ${formatarNumero(dados.km / dados.viagens)}</span>
                </div>
                <span class="money" style="margin-top:5px;">${formatarMoeda(dados.valor)}</span>
            </div>
        `).join('');

        elementos.contentArea.innerHTML = `
            <h3 class="mobile-title">Rotas Mais Frequentes</h3>
            <div class="mobile-card-list">${cards}</div>
        `;
        return;
    }

    // VERSÃO DESKTOP
    elementos.contentArea.innerHTML = `
        <div class="summary-card">
            <div class="summary-header">
                <div class="summary-title">Rotas Mais Frequentes</div>
                <div class="summary-icon"><i class="fas fa-route"></i></div>
            </div>
            <table class="summary-table">
                <thead>
                    <tr>
                        <th>Rota (Origem → Destino)</th>
                        <th class="center">Viagens</th>
                        <th class="center">KM Médio</th>
                        <th class="money">Faturamento Total</th>
                        <th class="money">Média por Viagem</th>
                        <th class="money">Média por KM</th>
                         <th class="center">Ação</th>
                    </tr>
                </thead>
                <tbody>
                    ${resumo.rotasOrdenadas.map(([rota, dados]) => {
                        const kmMedio = dados.km / dados.viagens;
                        const mediaViagem = dados.valor / dados.viagens;
                        const mediaKM = dados.km > 0 ? dados.valor / dados.km : 0;
                        
                        // --- CORREÇÃO AQUI: Tratamento seguro de aspas ---
                        // Substitui aspas duplas por &quot; e simples por \'
                        const rotaSegura = rota
                            .replace(/"/g, '&quot;')
                            .replace(/'/g, "\\'");

                        return `
                            <tr>
                                <td>
                                    <div style="display:flex; align-items:center; gap:8px;">
                                        <i class="fas fa-map-marker-alt" style="color:var(--cor-secundaria)"></i>
                                        ${rota}
                                    </div>
                                </td>
                                <td class="center">${dados.viagens}</td>
                                <td class="center">${formatarNumero(kmMedio)}</td>
                                <td class="money">${formatarMoeda(dados.valor)}</td>
                                <td class="money">${formatarMoeda(mediaViagem)}</td>
                                <td class="money">${formatarMoeda(mediaKM)}/km</td>
                                <td class="center">
                                    <button class="btn btn-secondary" style="padding: 2px 8px; font-size: 0.7rem;" 
                                        onclick="window.abrirDetalhesRota('${encodeURIComponent(rota)}', ${kmMedio})">
                                        <i class="fas fa-route"></i> Ver Rota
                                    </button>
                                </td>
                            </tr>
                        `;
                    }).join('')}
                </tbody>
            </table>
        </div>
    `;
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

// ========== FUNÇÕES PRINCIPAIS ==========

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

function aplicarFiltroData() {
    if (!dadosOriginais) { mostrarNotificacao('❌ Dados ainda não carregados', 'error'); return; }
    if (indiceColunaData === null) { mostrarNotificacao('❌ Coluna de data não encontrada', 'error'); return; }
    const inicio = document.getElementById('dataInicio').value;
    const fim = document.getElementById('dataFim').value;
    if (!inicio || !fim) { mostrarNotificacao('⚠️ Selecione as duas datas', 'error'); return; }
    const dataInicio = new Date(inicio);
    const dataFim = new Date(fim);
    dataFim.setHours(23, 59, 59, 999);
    const cabecalho = dadosOriginais[0];
    const linhas = dadosOriginais.slice(1);
    const linhasFiltradas = linhas.filter(linha => {
        const data = parsearDataBR(linha[indiceColunaData]);
        return data && data >= dataInicio && data <= dataFim;
    });
    if (!linhasFiltradas.length) { mostrarNotificacao('⚠️ Nenhum registro no período', 'error'); return; }
    dadosAnalisados = analisarDadosMineramix([cabecalho, ...linhasFiltradas]);
    const itemAtivo = document.querySelector('.menu-item.active');
    const relatorioAtual = itemAtivo ? itemAtivo.getAttribute('data-report') : 'overview';
    mostrarRelatorio(relatorioAtual);
    mostrarNotificacao(`📅 Período aplicado: ${linhasFiltradas.length} registros`, 'success');
}

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
        icon.className = 'fas fa-sun';
        localStorage.setItem('darkMode', 'on');
    } else {
        icon.className = 'fas fa-moon';
        localStorage.setItem('darkMode', 'off');
    }
}

document.addEventListener('DOMContentLoaded', function() {
    const menuItems = document.querySelectorAll('.menu-item[data-report]');
    menuItems.forEach(item => { item.style.display = 'flex'; item.style.visibility = 'visible'; item.style.opacity = '1'; });
    const menuItemsAll = document.querySelectorAll('.menu-item');
    menuItemsAll.forEach(item => {
        item.addEventListener('click', function() {
            menuItemsAll.forEach(i => i.classList.remove('active'));
            this.classList.add('active');
            const report = this.getAttribute('data-report');
            if (report) mostrarRelatorio(report);
            if (this.id === 'btn-refresh') carregarDados();
        });
    });
    if (localStorage.getItem('darkMode') === 'on') {
        document.body.classList.add('dark');
        const icon = document.querySelector('#btnDark i');
        if (icon) icon.className = 'fas fa-sun';
    }
    setTimeout(() => { carregarDados(); testarConexao(); }, 1000);
});

window.addEventListener('resize', function() {
    const itemAtivo = document.querySelector('.menu-item.active');
    if (itemAtivo && dadosAnalisados) {
        const report = itemAtivo.getAttribute('data-report');
        mostrarRelatorio(report); 
    }
});

let chartInstance = null;

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
    document.getElementById('modalDia').style.display = 'flex';
}

function fecharModal() {
    const modals = document.querySelectorAll('.modal-overlay');
    modals.forEach(m => m.style.display = 'none');
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
    document.getElementById('modalMotorista').style.display = 'flex';
}

function fecharModalMotorista() {
    document.getElementById('modalMotorista').style.display = 'none';
}

function abrirDetalhesVeiculo(placa) {
    if (!dadosAnalisados || !dadosAnalisados.veiculos[placa]) {
        alert("Dados não encontrados para este veículo no período selecionado.");
        return;
    }
    try {
        const d = dadosAnalisados.veiculos[placa];
        const faturamento = d.valor;
        const kmTotal = d.km;
        const litros = kmTotal > 0 ? kmTotal / CUSTOS.CONSUMO_MEDIO : 0;
        const custoDiesel = litros * CUSTOS.DIESEL_PRECO;
        const custoManutencao = faturamento * CUSTOS.MANUTENCAO_PCT;
        const lucroLiquido = faturamento - custoDiesel - custoManutencao;

        let motoristaPrincipal = "Analisando...";
        let rotaPrincipal = "Analisando...";
        
        if(dadosOriginais && indiceColunaData !== null) {
             const inicioInput = document.getElementById('dataInicio').value;
             const fimInput = document.getElementById('dataFim').value;
             let viagensFiltradas = [];
             if(inicioInput && fimInput) {
                 const dInicio = new Date(inicioInput);
                 const dFim = new Date(fimInput);
                 dFim.setHours(23,59,59);
                 viagensFiltradas = dadosOriginais.slice(1).filter(linha => {
                     const dt = parsearDataBR(linha[indiceColunaData]);
                     return dt >= dInicio && dt <= dFim && linha.toString().includes(placa);
                 });
             } else {
                 viagensFiltradas = dadosOriginais.slice(1).filter(l => l.toString().includes(placa));
             }
             const contMot = {};
             const contRota = {};
             const cols = detectingColumnsGlobal(dadosOriginais[0]); 
             const idxMot = cols.motorista;
             const idxOrig = cols.origem;
             const idxDest = cols.destino;

             viagensFiltradas.forEach(v => {
                 if(idxMot !== undefined) { const m = v[idxMot] || 'Desconhecido'; contMot[m] = (contMot[m] || 0) + 1; }
                 if(idxOrig !== undefined && idxDest !== undefined) { const r = `${v[idxOrig]} -> ${v[idxDest]}`; contRota[r] = (contRota[r] || 0) + 1; }
             });
             const sortMot = Object.entries(contMot).sort((a,b)=>b[1]-a[1]);
             if(sortMot.length > 0) motoristaPrincipal = `${sortMot[0][0]} (${Math.round(sortMot[0][1]/viagensFiltradas.length*100)}%)`;
             const sortRota = Object.entries(contRota).sort((a,b)=>b[1]-a[1]);
             if(sortRota.length > 0) rotaPrincipal = sortRota[0][0];
        }

        document.getElementById('textoPlaca').textContent = placa;
        document.getElementById('modalFaturamento').textContent = formatarMoeda(faturamento);
        document.getElementById('modalKM').textContent = formatarNumero(kmTotal) + ' km';
        document.getElementById('modalCustoCombustivel').textContent = `- ${formatarMoeda(custoDiesel)}`;
        document.getElementById('modalCustoManutencao').textContent = `- ${formatarMoeda(custoManutencao)}`;
        const elLucroLiq = document.getElementById('modalLucroLiquido');
        elLucroLiq.textContent = formatarMoeda(lucroLiquido);
        elLucroLiq.style.color = lucroLiquido >= 0 ? 'var(--cor-pago)' : '#dc3545';
        document.getElementById('textoMotoristaVeiculo').textContent = motoristaPrincipal;
        document.getElementById('modalRota').textContent = rotaPrincipal;
        document.getElementById('modalMedia').textContent = formatarMoeda(d.viagens > 0 ? faturamento/d.viagens : 0);
        document.getElementById('modalVeiculo').style.display = 'flex';
    } catch (e) {
        console.error("Erro detalhes veiculo", e);
        alert("Erro ao processar dados: " + e.message);
    }
}

function fecharModalVeiculo() {
    document.getElementById('modalVeiculo').style.display = 'none';
}

function detectingColumnsGlobal(cabecalhos) {
    const map = {};
    cabecalhos.forEach((c, i) => {
        const t = c.toString().toLowerCase();
        if(t.includes('motorista')) map.motorista = i;
        if(t.includes('origem')) map.origem = i;
        if(t.includes('destino')) map.destino = i;
    });
    return map;
}

window.onclick = function(event) {
    if (event.target.classList.contains('modal-overlay')) {
        fecharModal();
    }
}

function calcularCustoPedagio(destino) {
    // 1. Limpeza de segurança: Converte para texto e Remove a seta "→" se existir
    let destLimpo = String(destino || "").toUpperCase();
    if (destLimpo.includes('→')) {
        destLimpo = destLimpo.split('→')[1] || destLimpo; // Pega o que vem depois da seta
    }
    destLimpo = destLimpo.trim(); // Remove espaços extras

    console.log("🔍 Calculando pedágio para:", destLimpo); // Debug para você ver

    let custo = 0;
    let detalhes = [];

    // --- LÓGICA DE ROTAS ---
    
    // Rota 1: Região dos Lagos
    if (destLimpo.includes('CABO FRIO') || destLimpo.includes('BUZIOS') || destLimpo.includes('ARRAIAL') || destLimpo.includes('SAO PEDRO') || destLimpo.includes('IGUABA')) {
        custo += CUSTO_PEDAGIOS.VIA_LAGOS;
        detalhes.push(`Via Lagos (R$ ${formatarMoeda(CUSTO_PEDAGIOS.VIA_LAGOS)})`);
    }

    // Rota 2: BR-101 Norte (Macaé/Campos)
    if (destLimpo.includes('MACAE') || destLimpo.includes('RIO DAS OSTRAS') || destLimpo.includes('CAMPOS') || destLimpo.includes('CASIMIRO')) {
        custo += CUSTO_PEDAGIOS.AUTOPISTA_FLUMINENSE;
        detalhes.push(`Praça BR-101 (R$ ${formatarMoeda(CUSTO_PEDAGIOS.AUTOPISTA_FLUMINENSE)})`);
    }

    // Rota 3: Rio/Niterói
    if (destLimpo.includes('RIO DE JANEIRO') || destLimpo.includes('NITEROI') || destLimpo.includes('SAO GONCALO') || destLimpo.includes('ITABORAI') || destLimpo.includes('DUQUE')) {
        custo += CUSTO_PEDAGIOS.AUTOPISTA_FLUMINENSE; 
        detalhes.push(`Pedágio Manilha (R$ ${formatarMoeda(CUSTO_PEDAGIOS.AUTOPISTA_FLUMINENSE)})`);
        
        if(destLimpo.includes('RIO DE JANEIRO') || destLimpo.includes('DUQUE')) {
            custo += CUSTO_PEDAGIOS.PONTE_RIO_NITEROI;
            detalhes.push(`Ponte Rio-Niterói (R$ ${formatarMoeda(CUSTO_PEDAGIOS.PONTE_RIO_NITEROI)})`);
        }
    }

    // Se não achou nada, retorna zerado mas sem erro
    if (custo === 0) {
        detalhes.push("Rota local ou sem pedágio mapeado");
    }

    return { total: custo, lista: detalhes };
}
// =============================================================
// TROQUE A FUNÇÃO abrirDetalhesRota INTEIRA POR ESTA VERSÃO:
// =============================================================

window.abrirDetalhesRota = function(rotaCodificada, kmTotal) {
    try {
        // 1. Decodificar e Limpar o Nome
        const destinoBruto = decodeURIComponent(rotaCodificada);
        // Remove tudo antes da seta e a própria seta
        const destinoNome = destinoBruto.replace(/.*→/, '').trim(); 
        
        console.log("🚀 Iniciando abertura do modal para:", destinoNome);

        // 2. Calcular
        const infoPedagio = calcularCustoPedagio(destinoNome);

        // 3. Capturar Elementos HTML (Com verificação rigorosa)
        const elDestino = document.getElementById('rotaDestinoNome');
        const elRotaKm = document.getElementById('rotaKm');
        const elResumoKm = document.getElementById('resumoKm');
        const elResumoPedagio = document.getElementById('resumoPedagio');
        const containerPedagios = document.getElementById('rotaPedagios');
        const modal = document.getElementById('modalRota');

        // SE ALGUM DESSES FALTAR, O CÓDIGO AVISA E PARA (Evita tela travada)
        if (!modal) throw new Error("Elemento 'modalRota' não encontrado no HTML");
        if (!elDestino) throw new Error("Elemento 'rotaDestinoNome' não encontrado");
        if (!containerPedagios) throw new Error("Elemento 'rotaPedagios' não encontrado");

        // 4. Preencher HTML
        elDestino.textContent = destinoNome;
        elRotaKm.textContent = formatarNumero(kmTotal) + ' km (Estimado)';
        elResumoKm.textContent = formatarNumero(kmTotal) + ' km';
        
        // Formata o valor com cor vermelha se for > 0
        elResumoPedagio.textContent = formatarMoeda(infoPedagio.total);
        elResumoPedagio.style.color = infoPedagio.total > 0 ? '#dc3545' : 'var(--cor-texto)';

        // 5. Lista de Pedágios (Visual)
        containerPedagios.innerHTML = ''; 
        infoPedagio.lista.forEach(item => {
            const badge = document.createElement('span');
            badge.className = 'toll-badge';
            // Se for "Rota local...", usa cor cinza, senão amarelo
            const isInfo = item.includes("Rota local");
            badge.style.background = isInfo ? '#e9ecef' : '#ffc107';
            badge.style.color = isInfo ? '#666' : '#333';
            
            badge.innerHTML = `<i class="fas fa-ticket-alt"></i> ${item}`;
            containerPedagios.appendChild(badge);
        });

        // 6. FORÇAR ABERTURA (Display Flex)
        modal.style.display = 'flex';
        console.log("✅ Modal aberto com sucesso!");

    } catch (erro) {
        console.error("❌ Erro ao abrir modal:", erro);
        alert("Erro técnico ao abrir rota: " + erro.message);
    }
}
