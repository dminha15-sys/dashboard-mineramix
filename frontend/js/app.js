// ==========================================
// 1. CONFIGURAÇÕES E CONSTANTES GLOBAIS
// ==========================================
const CUSTOS = {
    DIESEL_PRECO: 6.00,
    CONSUMO_MEDIO: 2.0, // km/L
    MANUTENCAO_PCT: 0.12 // 12% sobre o faturamento
};

// CONFIG vem do config.js

const CUSTO_PEDAGIOS = {
    'AUTOPISTA_FLUMINENSE': 6.90,
    'VIA_LAGOS': 27.00,
    'PONTE_RIO_NITEROI': 6.20,
    'OUTROS': 0.00
};

// Variáveis de Estado
let dadosAnalisados = null;
let dadosOriginais = null;
let dadosCombustivelOriginais = null; // COMBUSTÍVEL AQUI
let indiceColunaData = null;
let chartInstance = null;

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
// 2. FUNÇÕES DE LEITURA
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
    return Object.keys(mapeamento).map(nome => ({ nome: nome, indice: mapeamento[nome].indice, tipo: mapeamento[nome].tipo }));
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
// 3. FUNÇÕES VISUAIS
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
    if (window.innerWidth < 768) {
        const list = resumo.rotasOrdenadas.map(([r, d]) => `<div class="mobile-card"><strong>${r}</strong><span>${d.viagens} viagens</span><span class="money">${formatarMoeda(d.valor)}</span></div>`).join('');
        elementos.contentArea.innerHTML = `<h3 class="mobile-title">Rotas</h3><div class="mobile-card-list">${list}</div>`;
        return;
    }
    elementos.contentArea.innerHTML = `
    <div class="summary-card">
        <div class="summary-header"><div class="summary-title">Rotas Frequentes</div></div>
        <table class="summary-table"><thead><tr><th>Rota</th><th class="center">Viagens</th><th class="money">Total</th></tr></thead><tbody>
        ${resumo.rotasOrdenadas.map(([r, d]) => `<tr><td>${r}</td><td class="center">${d.viagens}</td><td class="money">${formatarMoeda(d.valor)}</td></tr>`).join('')}
        </tbody></table>
    </div>`;
}

function mostrarRelatorioDiario(resumo) { /* Simplificado */ mostrarVisaoGeral(resumo); }
function mostrarRelatorioKM(resumo) { /* Simplificado */ mostrarVisaoGeral(resumo); }

// ==========================================
// 5. MODAIS (LÓGICA CORRIGIDA)
// ==========================================

// FUNÇÃO GLOBAL DE FECHAR MODAL (Para botão funcionar)
function fecharModalVeiculo() {
    const modal = document.getElementById('modalVeiculo');
    if(modal) modal.style.display = 'none';
}

function abrirDetalhesVeiculo(placa) {
    if (!dadosAnalisados || !dadosAnalisados.veiculos[placa]) {
        alert("Dados não encontrados.");
        return;
    }
    try {
        const d = dadosAnalisados.veiculos[placa];
        const faturamento = d.valor;
        const kmTotalEstimado = d.km;
        const litrosEstimados = kmTotalEstimado > 0 ? kmTotalEstimado / CUSTOS.CONSUMO_MEDIO : 0;
        const custoDieselEstimado = litrosEstimados * CUSTOS.DIESEL_PRECO;
        const custoManutencao = faturamento * CUSTOS.MANUTENCAO_PCT;
        const lucroLiquidoEstimado = faturamento - custoDieselEstimado - custoManutencao;

        // DADOS REAIS (Combustível)
        let litrosDieselReal = 0;
        let valorDieselReal = 0;
        let litrosArlaReal = 0;
        let valorArlaReal = 0;
        let encontrouDadosReais = false;

        // Filtros de Data (CORRIGIDO)
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

        // PREENCHER TELA
        document.getElementById('textoPlaca').textContent = placa;
        document.getElementById('modalFaturamento').textContent = formatarMoeda(faturamento);
        document.getElementById('modalKM').textContent = formatarNumero(kmTotalEstimado) + ' km';
        document.getElementById('modalCustoCombustivel').textContent = `- ${formatarMoeda(custoDieselEstimado)}`;
        document.getElementById('modalCustoManutencao').textContent = `- ${formatarMoeda(custoManutencao)}`;
        const elLucroLiq = document.getElementById('modalLucroLiquido');
        elLucroLiq.textContent = formatarMoeda(lucroLiquidoEstimado);
        elLucroLiq.style.color = lucroLiquidoEstimado >= 0 ? 'var(--cor-pago)' : '#dc3545';

        // Atualizar Dados Reais (HTML NOVO E CORRIGIDO DE CORES)
        const elRealContainer = document.getElementById('containerDadosReais');
        if (encontrouDadosReais) {
            elRealContainer.style.display = 'block';
            
            // Injeção de HTML Dinâmico para compatibilidade de cores
            elRealContainer.innerHTML = `
                <h4 style="font-size: 0.8rem; text-transform: uppercase; color: var(--cor-texto-sec); margin: 0 0 1rem 0; text-align: center; letter-spacing: 1px; border-bottom: 1px dashed var(--cor-borda); padding-bottom: 8px;">
                    <i class="fas fa-gas-pump" style="color: var(--cor-secundaria);"></i> Consumo Real (Abastecimentos)
                </h4>
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem;">
                    <div style="display: flex; flex-direction: column; gap: 0.5rem; border-right: 1px solid var(--cor-borda); padding-right: 0.8rem;">
                        <span style="font-size: 0.75rem; font-weight: 700; color: var(--cor-texto); text-align: center; display: block; margin-bottom: 2px;">DIESEL</span>
                        <div style="display: flex; justify-content: space-between; font-size: 0.85rem;">
                            <span style="color: var(--cor-texto-sec);">Litros</span>
                            <strong style="color: var(--cor-primaria);">${formatarNumero(litrosDieselReal)} L</strong>
                        </div>
                        <div style="display: flex; justify-content: space-between; font-size: 0.85rem;">
                            <span style="color: var(--cor-texto-sec);">Gasto</span>
                            <strong style="color: #dc3545;">- ${formatarMoeda(valorDieselReal)}</strong>
                        </div>
                    </div>
                    <div style="display: flex; flex-direction: column; gap: 0.5rem; padding-left: 0.5rem;">
                        <span style="font-size: 0.75rem; font-weight: 700; color: var(--cor-texto); text-align: center; display: block; margin-bottom: 2px;">ARLA 32</span>
                        <div style="display: flex; justify-content: space-between; font-size: 0.85rem;">
                            <span style="color: var(--cor-texto-sec);">Litros</span>
                            <strong style="color: var(--cor-primaria);">${formatarNumero(litrosArlaReal)} L</strong>
                        </div>
                        <div style="display: flex; justify-content: space-between; font-size: 0.85rem;">
                            <span style="color: var(--cor-texto-sec);">Gasto</span>
                            <strong style="color: #dc3545;">- ${formatarMoeda(valorArlaReal)}</strong>
                        </div>
                    </div>
                </div>
            `;
        } else {
            elRealContainer.style.display = 'none';
        }

        // Motorista Principal
        let motoristaPrincipal = "---";
        if(dadosOriginais && indiceColunaData !== null) {
             let viagensFiltradas = dadosOriginais.slice(1).filter(linha => {
                 const dt = parsearDataBR(linha[indiceColunaData]);
                 return dt >= dInicio && dt <= dFim && linha.toString().includes(placa);
             });
             const cols = detectColumnsGlobal(dadosOriginais[0]); 
             const contMot = {};
             viagensFiltradas.forEach(v => {
                 if(cols.motorista !== undefined) { const m = v[cols.motorista] || 'Desconhecido'; contMot[m] = (contMot[m] || 0) + 1; }
             });
             const sortMot = Object.entries(contMot).sort((a,b)=>b[1]-a[1]);
             if(sortMot.length > 0) motoristaPrincipal = `${sortMot[0][0]} (${Math.round(sortMot[0][1]/viagensFiltradas.length*100)}%)`;
        }
        document.getElementById('textoMotoristaVeiculo').textContent = motoristaPrincipal;
        document.getElementById('modalVeiculo').style.display = 'flex';
    } catch (e) {
        console.error("Erro detalhes veiculo", e);
        alert("Erro: " + e.message);
    }
}

// Outros modais
function abrirDetalhesMotorista(nome) { /* Mantido */ }
function fecharModalMotorista() { document.getElementById('modalMotorista').style.display = 'none'; }
function fecharModal() { document.querySelectorAll('.modal-overlay').forEach(m => m.style.display = 'none'); }

// ==========================================
// 6. CARREGAMENTO (Inicialização)
// ==========================================

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

// Tornar funções globais
window.fecharModalVeiculo = fecharModalVeiculo;
window.abrirDetalhesVeiculo = abrirDetalhesVeiculo;
window.abrirDetalhesMotorista = abrirDetalhesMotorista;
window.fecharModal = fecharModal;
