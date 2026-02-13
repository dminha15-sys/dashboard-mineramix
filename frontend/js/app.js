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
let dadosCombustivelOriginais = null;
let indiceColunaData = null;
let chartInstance = null; // Para o gráfico de modal
let overviewChart = null; // Para o gráfico da visão geral

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
    // Ordena dias por data (padrão)
    resumo.diasOrdenados = Object.entries(resumo.dias).sort((a, b) => new Date(b[0].split('/').reverse().join('-')) - new Date(a[0].split('/').reverse().join('-')));

    return resumo;
}

// ==========================================
// 3. UI HELPER FUNCTIONS
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
// 4. SISTEMA DE RELATÓRIOS E GRÁFICOS
// ==========================================

function mostrarRelatorio(tipo) {
    if (!dadosAnalisados) {
        elementos.contentArea.innerHTML = `<div class="loading"><i class="fas fa-exclamation-triangle"></i><p>Nenhum dado disponível. Clique em "Atualizar".</p></div>`;
        return;
    }

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

    // --- CHART HTML COM BARRA DE FILTRO INTEGRADA ---
    const chartHTML = `
    <div class="summary-cards" style="grid-template-columns: 1fr; margin-bottom: 1.5rem;">
        <div class="summary-card">
            <div class="summary-header">
                <div class="summary-title" id="tituloGraficoDinamico">Tendência dos Últimos 10 Dias</div>
                <div class="summary-icon"><i class="fas fa-chart-line"></i></div>
            </div>
            
            <div class="chart-toolbar">
                <div class="chart-presets">
                    <button class="chart-btn" onclick="window.filtrarGrafico('5')">5 Dias</button>
                    <button class="chart-btn active" onclick="window.filtrarGrafico('10')" id="btnPadrao">10 Dias</button>
                    <button class="chart-btn" onclick="window.filtrarGrafico('15')">15 Dias</button>
                    <button class="chart-btn" onclick="window.filtrarGrafico('30')">30 Dias</button>
                </div>
                <div class="chart-custom-range">
                    <input type="date" id="gInicio" class="chart-date-input" placeholder="Início">
                    <span style="font-size:0.8rem; color:var(--cor-texto-sec)">até</span>
                    <input type="date" id="gFim" class="chart-date-input" placeholder="Fim">
                    <button class="chart-btn" onclick="window.filtrarGrafico('custom')" style="background:var(--cor-primaria); color:#fff;"><i class="fas fa-filter"></i></button>
                </div>
            </div>

            <div style="height: 300px; width: 100%; position: relative;">
                <canvas id="graficoGeral"></canvas>
            </div>
        </div>
    </div>`;

    const topMotoristas = resumo.motoristasOrdenados.slice(0, 5);
    const topVeiculos = resumo.veiculosOrdenados.slice(0, 5);
    const topMeses = Object.entries(resumo.meses).sort((a,b) => b[1].valor - a[1].valor).slice(0, 5);

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
    
    elementos.contentArea.innerHTML = metricsHTML + chartHTML + summaryHTML;

    // --- LÓGICA DE FILTRAGEM E DESENHO DO GRÁFICO ---
    
    // Função interna que desenha o canvas
    const desenhar = (dadosFiltrados) => {
        const ctx = document.getElementById('graficoGeral').getContext('2d');
        if (window.overviewChart instanceof Chart) window.overviewChart.destroy();

        // Prepara dados (inverte para ficar Cronológico: Antigo -> Novo)
        const dadosGrafico = [...dadosFiltrados].reverse();
        
        const labels = dadosGrafico.map(d => d[0].substring(0, 5)); // DD/MM
        const dataViagens = dadosGrafico.map(d => d[1].viagens);
        const dataValor = dadosGrafico.map(d => d[1].valor);

        const isDark = document.body.classList.contains('dark');
        const colorText = isDark ? '#b0b0b0' : '#4a5568';
        const colorGrid = isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.05)';
        const isMobile = window.innerWidth < 768;

        window.overviewChart = new Chart(ctx, {
            type: isMobile ? 'bar' : 'line',
            data: {
                labels: labels,
                datasets: [
                    {
                        label: 'Qtd Viagens',
                        data: dataViagens,
                        borderColor: '#FF6B35', 
                        backgroundColor: isMobile ? '#FF6B35' : 'rgba(255, 107, 53, 0.1)',
                        yAxisID: 'y',
                        tension: 0.3,
                        fill: !isMobile,
                        pointRadius: 4,
                        order: 2
                    },
                    {
                        label: 'Valor Total (R$)',
                        data: dataValor,
                        borderColor: '#28a745', 
                        backgroundColor: 'transparent',
                        yAxisID: 'y1',
                        tension: 0.3,
                        borderDash: isMobile ? [] : [5, 5],
                        pointRadius: 4,
                        type: 'line', 
                        order: 1
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                interaction: { mode: 'index', intersect: false },
                plugins: {
                    legend: { labels: { color: colorText } },
                    tooltip: {
                        callbacks: {
                            label: function(context) {
                                let label = context.dataset.label || '';
                                if (label) label += ': ';
                                if (context.parsed.y !== null) {
                                    if(context.dataset.yAxisID === 'y1') label += formatarMoeda(context.parsed.y);
                                    else label += context.parsed.y;
                                }
                                return label;
                            }
                        }
                    }
                },
                scales: {
                    x: { grid: { display: false }, ticks: { color: colorText } },
                    y: {
                        type: 'linear', display: true, position: 'left',
                        title: { display: !isMobile, text: 'Viagens', color: colorText },
                        grid: { color: colorGrid }, ticks: { color: colorText }
                    },
                    y1: {
                        type: 'linear', display: !isMobile, position: 'right',
                        title: { display: !isMobile, text: 'Valor (R$)', color: colorText },
                        grid: { drawOnChartArea: false }, ticks: { color: colorText }
                    }
                }
            }
        });
    };

    // --- FUNÇÃO EXPORTADA PARA OS BOTÕES ---
    window.filtrarGrafico = function(tipo) {
        let dadosFiltrados = [];
        const tituloEl = document.getElementById('tituloGraficoDinamico');
        
        // Remove active de todos
        document.querySelectorAll('.chart-btn').forEach(b => b.classList.remove('active'));

        if (tipo === 'custom') {
            const inicioVal = document.getElementById('gInicio').value;
            const fimVal = document.getElementById('gFim').value;
            
            if (!inicioVal || !fimVal) {
                mostrarNotificacao('Selecione as duas datas', 'error');
                return;
            }

            // Converte input YYYY-MM-DD para Date zerada
            const dInicio = new Date(inicioVal + 'T00:00:00');
            const dFim = new Date(fimVal + 'T23:59:59');

            // Filtra o array completo de dias (diasOrdenados está do mais novo pro mais antigo)
            dadosFiltrados = resumo.diasOrdenados.filter(([dataStr, _]) => {
                const partes = dataStr.split('/');
                const dataDia = new Date(partes[2], partes[1]-1, partes[0]); // YYYY, MM-1, DD
                return dataDia >= dInicio && dataDia <= dFim;
            });

            // Atualiza título com datas formatadas
            const fmt = (d) => d.toLocaleDateString('pt-BR');
            tituloEl.textContent = `Período: ${fmt(dInicio)} até ${fmt(dFim)}`;
            
            // Marca o botão custom (opcional, ou o botão de ícone)
            event.currentTarget.classList.add('active');

        } else {
            // É um botão de dias predefinidos (5, 10, 15, 30)
            const dias = parseInt(tipo);
            dadosFiltrados = resumo.diasOrdenados.slice(0, dias);
            tituloEl.textContent = `Tendência dos Últimos ${dias} Dias`;
            
            // Marca o botão clicado
            const btn = Array.from(document.querySelectorAll('.chart-btn')).find(b => b.textContent.includes(dias + ' Dias'));
            if(btn) btn.classList.add('active');
        }

        if (dadosFiltrados.length === 0) {
            mostrarNotificacao('Nenhum dado neste período', 'error');
            return;
        }

        desenhar(dadosFiltrados);
    };

    // INICIALIZAÇÃO PADRÃO: 10 DIAS
    // Chama a filtragem diretamente para desenhar e setar o título inicial
    window.filtrarGrafico('10');

    // Listener de resize para responsividade
    if (window.resizeChartListener) window.removeEventListener('resize', window.resizeChartListener);
    window.resizeChartListener = () => {
        // Redesenha com o estado atual (seria ideal salvar estado, mas default 10 serve para resize rápido)
        // Se quiser persistir o filtro no resize, precisaria de uma var global 'filtroAtualGrafico'
        // Por simplicidade, mantemos responsividade básica.
    };
    window.addEventListener('resize', window.resizeChartListener);
}
// === MOTORISTAS COM FILTRO ===
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
        <table class="summary-table">
            <thead>
                <tr>
                    <th>Motorista <i class="fas fa-sort-alpha-down btn-sort" onclick="ordenarRelatorio('motoristas', 'key')"></i></th>
                    <th class="center">Viagens <i class="fas fa-sort-amount-down btn-sort" onclick="ordenarRelatorio('motoristas', 'viagens')"></i></th>
                    <th class="center">KM Total</th>
                    <th class="money">Total Faturado <i class="fas fa-sort-amount-down btn-sort" onclick="ordenarRelatorio('motoristas', 'valor')"></i></th>
                    <th class="center">Detalhes</th>
                </tr>
            </thead>
            <tbody>
                ${resumo.motoristasOrdenados.map(([nome, d]) => `<tr ${gerarClick(nome)} class="hover-row"><td>${nome}</td><td class="center">${d.viagens}</td><td class="center">${formatarNumero(d.km)}</td><td class="money">${formatarMoeda(d.valor)}</td><td class="center"><i class="fas fa-search"></i></td></tr>`).join('')}
            </tbody>
        </table>
    </div>`;
}

// === VEÍCULOS COM FILTRO ===
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
        <table class="summary-table">
            <thead>
                <tr>
                    <th>Placa <i class="fas fa-sort-alpha-down btn-sort" onclick="ordenarRelatorio('veiculos', 'key')"></i></th>
                    <th class="center">Viagens <i class="fas fa-sort-amount-down btn-sort" onclick="ordenarRelatorio('veiculos', 'viagens')"></i></th>
                    <th class="center">KM Total</th>
                    <th class="money">Total Faturado <i class="fas fa-sort-amount-down btn-sort" onclick="ordenarRelatorio('veiculos', 'valor')"></i></th>
                    <th class="center">Ação</th>
                </tr>
            </thead>
            <tbody>
                ${resumo.veiculosOrdenados.map(([placa, d]) => `<tr onclick="abrirDetalhesVeiculo('${placa}')" style="cursor:pointer" class="hover-row"><td>${placa}</td><td class="center">${d.viagens}</td><td class="center">${formatarNumero(d.km)}</td><td class="money">${formatarMoeda(d.valor)}</td><td class="center"><i class="fas fa-search-plus" style="color:var(--cor-secundaria)"></i></td></tr>`).join('')}
            </tbody>
        </table>
    </div>`;
}

// === CLIENTES COM FILTRO ===
function mostrarRelatorioClientes(resumo) {
    if (window.innerWidth < 768) {
        const list = resumo.clientesOrdenados.slice(0, 50).map(([c, d]) => 
            `<div class="mobile-card" onclick="abrirDetalhesCliente('${c}')">
                <strong>${c}</strong>
                <div style="display:flex; justify-content:space-between; margin-top:5px;">
                    <span class="status-badge status-analise">${d.viagens} viagens</span>
                    <span class="money">${formatarMoeda(d.valor)}</span>
                </div>
             </div>`
        ).join('');
        elementos.contentArea.innerHTML = `<h3 class="mobile-title">Clientes (Toque para detalhar)</h3><div class="mobile-card-list">${list}</div>`;
        return;
    }
    elementos.contentArea.innerHTML = `
    <div class="summary-card">
        <div class="summary-header">
            <div class="summary-title">Resumo por Cliente</div>
            <small style="color:var(--cor-texto-sec)">Clique no cliente para ver o diário</small>
        </div>
        <table class="summary-table">
            <thead>
                <tr>
                    <th>Cliente <i class="fas fa-sort-alpha-down btn-sort" onclick="ordenarRelatorio('clientes', 'key')"></i></th>
                    <th class="center">Viagens <i class="fas fa-sort-amount-down btn-sort" onclick="ordenarRelatorio('clientes', 'viagens')"></i></th>
                    <th class="money">Total Faturado <i class="fas fa-sort-amount-down btn-sort" onclick="ordenarRelatorio('clientes', 'valor')"></i></th>
                    <th class="money">Média/Viagem</th>
                    <th class="center">Ação</th>
                </tr>
            </thead>
            <tbody>
            ${resumo.clientesOrdenados.map(([c, d]) => `
                <tr onclick="abrirDetalhesCliente('${c}')" style="cursor:pointer" class="hover-row">
                    <td><strong>${c}</strong></td>
                    <td class="center">${d.viagens}</td>
                    <td class="money">${formatarMoeda(d.valor)}</td>
                    <td class="money">${formatarMoeda(d.valor/d.viagens)}</td>
                    <td class="center"><i class="fas fa-search-plus" style="color:var(--cor-secundaria)"></i></td>
                </tr>`).join('')}
            </tbody>
        </table>
    </div>`;
}

// === ROTAS COM FILTRO ===
function mostrarRelatorioRotas(resumo) {
    const gerarClick = (rota, km) => {
        const rotaSafe = encodeURIComponent(rota);
        return `onclick="abrirDetalhesRota('${rotaSafe}', ${km || 0})" style="cursor:pointer"`;
    };

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

    elementos.contentArea.innerHTML = `
    <div class="summary-card">
        <div class="summary-header"><div class="summary-title">Rotas Frequentes</div></div>
        <table class="summary-table">
            <thead>
                <tr>
                    <th>Rota <i class="fas fa-sort-alpha-down btn-sort" onclick="ordenarRelatorio('rotas', 'key')"></i></th>
                    <th class="center">Viagens <i class="fas fa-sort-amount-down btn-sort" onclick="ordenarRelatorio('rotas', 'viagens')"></i></th>
                    <th class="center">KM Acumulado</th>
                    <th class="money">Faturamento <i class="fas fa-sort-amount-down btn-sort" onclick="ordenarRelatorio('rotas', 'valor')"></i></th>
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

// === DIÁRIO COM FILTRO E ALINHAMENTO CORRIGIDO ===
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
            <table class="summary-table">
                <thead>
                    <tr>
                        <th>Data <i class="fas fa-sort-numeric-down btn-sort" onclick="ordenarRelatorio('diario', 'key')" title="Ordenar por Data"></i></th>
                        
                        <th class="center">Viagens <i class="fas fa-sort-amount-down btn-sort" onclick="ordenarRelatorio('diario', 'viagens')" title="Ordenar por Qtd"></i></th>
                        
                        <th class="money">Faturamento Total <i class="fas fa-sort-amount-down btn-sort" onclick="ordenarRelatorio('diario', 'valor')" title="Ordenar por Valor"></i></th>
                        
                        <th class="money">Média</th>
                        <th class="center">Dia da Semana</th>
                        <th class="center">Ação</th>
                    </tr>
                </thead>
                <tbody>
                    ${listaDias.map(([dia, dados]) => {
                        const dataObj = parsearDataBR(dia);
                        const diaSemana = dataObj ? ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'][dataObj.getDay()] : '';
                        return `<tr ${gerarClick(dia)} class="hover-row">
                            <td>${dia}</td>
                            <td class="center">${dados.viagens}</td>
                            <td class="money">${formatarMoeda(dados.valor)}</td>
                            <td class="money">${formatarMoeda(dados.valor / dados.viagens)}</td>
                            <td class="center">${diaSemana}</td>
                            <td class="center"><i class="fas fa-chart-bar" style="color:var(--cor-secundaria)"></i></td>
                        </tr>`;
                    }).join('')}
                </tbody>
            </table>
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
// 5. MODAIS E LÓGICA
// ==========================================

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
    if (event.key === "Escape") fecharModalGlobal();
});

function abrirModalComHistorico(idModal) {
    const modal = document.getElementById(idModal);
    if(modal) {
        modal.style.display = 'flex';
        window.history.pushState({modalOpen: true}, "", "#modal");
    }
}

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
    const isDark = document.body.classList.contains('dark');
    const corTexto = isDark ? '#e9ecef' : '#1f2933';

    chartInstance = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{ data: valores, backgroundColor: '#FF6B35', borderRadius: 4 }]
        },
        plugins: [ChartDataLabels],
        options: {
            responsive: true, maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                datalabels: { color: corTexto, font: { weight: 'bold' }, anchor: 'end', align: 'end', formatter: (val) => formatarMoeda(val) }
            },
            scales: {
                x: { ticks: { color: corTexto }, grid: { display: false } },
                y: { display: false }
            }
        }
    });
}

function abrirDetalhesMotorista(nomeMotorista) {
    if(!dadosAnalisados) return;
    const dadosMot = dadosAnalisados.motoristas[nomeMotorista];
    if(!dadosMot) return alert('Dados não encontrados.');
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

        let litrosDieselReal = 0, valorDieselReal = 0, litrosArlaReal = 0, valorArlaReal = 0;
        let encontrouDadosReais = false;

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
                        if (tipo.includes('ARLA')) { litrosArlaReal += qtd; valorArlaReal += vlr; } 
                        else { litrosDieselReal += qtd; valorDieselReal += vlr; }
                    }
                }
            });
        }

        document.getElementById('textoPlaca').textContent = placa;
        document.getElementById('modalFaturamento').textContent = formatarMoeda(faturamento);
        document.getElementById('modalKM').textContent = formatarNumero(kmTotalEstimado) + ' km';
        document.getElementById('modalCustoCombustivel').textContent = `- ${formatarMoeda(custoDieselEstimado)}`;
        document.getElementById('modalCustoManutencao').textContent = `- ${formatarMoeda(custoManutencao)}`;
        const elLucroLiq = document.getElementById('modalLucroLiquido');
        elLucroLiq.textContent = formatarMoeda(lucroLiquidoEstimado);
        elLucroLiq.style.color = lucroLiquidoEstimado >= 0 ? 'var(--cor-pago)' : '#dc3545';

        const elRealContainer = document.getElementById('containerDadosReais');
        if (encontrouDadosReais) {
            elRealContainer.style.display = 'block';
            elRealContainer.style.background = 'transparent'; elRealContainer.style.border = 'none'; elRealContainer.style.padding = '0';
            elRealContainer.innerHTML = `
            <h4 style="font-size: 0.9rem; color: var(--cor-primaria); margin: 1.5rem 0 0.5rem 0.5rem; border-left: 3px solid var(--cor-secundaria); padding-left: 8px;">Consumo Real (Abastecimentos)</h4>
            <div style="background: var(--cor-fundo-menu); border-radius: 8px; border: 1px solid var(--cor-borda); overflow: hidden;">
                <div class="driver-list-item" style="display: flex; justify-content: space-between; align-items: center; padding: 0.8rem; border-bottom: 1px solid var(--cor-borda);">
                    <div><strong style="color:var(--cor-primaria); font-size: 0.95rem;">DIESEL S-10</strong><br><small style="color:var(--cor-texto-sec); font-size: 0.8rem;">${formatarNumero(litrosDieselReal)} Litros</small></div>
                    <div class="money" style="color: #dc3545; font-size: 1rem;">- ${formatarMoeda(valorDieselReal)}</div>
                </div>
                <div class="driver-list-item" style="display: flex; justify-content: space-between; align-items: center; padding: 0.8rem;">
                    <div><strong style="color:var(--cor-primaria); font-size: 0.95rem;">ARLA 32</strong><br><small style="color:var(--cor-texto-sec); font-size: 0.8rem;">${formatarNumero(litrosArlaReal)} Litros</small></div>
                    <div class="money" style="color: #dc3545; font-size: 1rem;">- ${formatarMoeda(valorArlaReal)}</div>
                </div>
            </div>`;
        } else {
            elRealContainer.style.display = 'none';
        }

        let motoristaPrincipal = "---", rotaPrincipal = "---";
        if(dadosOriginais && indiceColunaData !== null) {
             let viagensFiltradas = dadosOriginais.slice(1).filter(linha => {
                 const dt = parsearDataBR(linha[indiceColunaData]);
                 return dt >= dInicio && dt <= dFim && linha.toString().includes(placa);
             });
             const cols = detectColumnsGlobal(dadosOriginais[0]); 
             const contMot = {}, contRota = {};
             viagensFiltradas.forEach(v => {
                 if(cols.motorista !== undefined) { const m = v[cols.motorista] || 'Desc'; contMot[m] = (contMot[m] || 0) + 1; }
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
        console.error(e);
        alert("Erro: " + e.message);
    }
}

function fecharModalMotorista() { fecharModalGlobal(); }
function fecharModal() { fecharModalGlobal(); }
function fecharModalVeiculo() { fecharModalGlobal(); }
function fecharModalRota() { fecharModalGlobal(); }
function fecharModalCliente() { document.getElementById('modalDetalheCliente').style.display = 'none'; }

const TABELA_ROTAS_INTELIGENTE = {
    'CABO FRIO': {
        km: 52.5,
        mapaUrl: 'https://www.google.com/maps/embed?pb=!1m28!1m12!1m3!1d3683.4106022275396!2d-42.0256325!3d-22.601137299999998!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!4m13!3e0!4m5!1s0x97ae1259163945%3A0x3e29485642a05fee!2sMinerare%20Minera%C3%A7%C3%A3o%2C%20Estr.%20Mico-Le%C3%A3o-Dourado%2C%20s%2Fn%20-%20Tamoios%2C%20Cabo%20Frio%20-%20RJ%2C%2028925-440!3m2!1d-22.6009967!2d-42.025559!4m5!1s0x97073d3c0566d5%3A0x5115f34a20c5ad67!2sCabo%20Frio%2C%20RJ!3m2!1d-22.8868925!2d-42.0266568!5e0!3m2!1spt-BR!2sbr!4v1769184172669!5m2!1spt-BR!2sbr" width="600" height="450" style="border:0;" allowfullscreen="" loading="lazy" referrerpolicy="no-referrer-when-downgrade',
        pedagios: [ { nome: "Não Há", custo_eixo: 0.0 }, ]
    },
    'MACAÉ': { 
        km: 40.6,
        mapaUrl: 'https://www.google.com/maps/embed?pb=!1m28!1m12!1m3!1d257175.06074194243!2d-41.997661641280054!3d-22.547188464946306!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!4m13!3e0!4m5!1s0x97ae1259163945%3A0x3e29485642a05fee!2sMinerare%20Minera%C3%A7%C3%A3o%2C%20Estr.%20Mico-Le%C3%A3o-Dourado%2C%20s%2Fn%20-%20Tamoios%2C%20Cabo%20Frio%20-%20RJ%2C%2028925-440!3m2!1d-22.6009967!2d-42.025559!4m5!1s0x9630267844443b%3A0x9840d1e83fd0de59!2zTWFjYcOpLCBSSg!3m2!1d-22.3836956!2d-41.7827676!5e0!3m2!1spt-BR!2sbr!4v1769184397919!5m2!1spt-BR!2sbr" width="600" height="450" style="border:0;" allowfullscreen="" loading="lazy" referrerpolicy="no-referrer-when-downgrade',
        pedagios: [ { nome: "Não Há", custo_eixo: 0.0 }, ]
    },
    
    'RIO DE JANEIRO': {
        km: 180,
        mapaUrl: 'https://www.google.com/maps/embed?pb=!1m34!1m12!1m3!1d3683.4106022275846!2d-42.02745899543678!3d-22.601137299999994!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!4m19!3e0!4m5!1s0x97ae1259163945%3A0x3e29485642a05fee!2sMinerare%20Minera%C3%A7%C3%A3o%2C%20Estr.%20Mico-Le%C3%A3o-Dourado%2C%20s%2Fn%20-%20Tamoios%2C%20Cabo%20Frio%20-%20RJ%2C%2028925-440!3m2!1d-22.6009967!2d-42.025559!4m5!1s0x97bac04db8ab0f%3A0xd0da30b53c3fb75f!2sCasimiro%20de%20Abreu%2C%20RJ%2C%2028860-000!3m2!1d-22.479796699999998!2d-42.202903!4m5!1s0x9bde559108a05b%3A0x50dc426c672fd24e!2sRio%20de%20Janeiro%2C%20RJ!3m2!1d-22.9068467!2d-43.1728965!5e0!3m2!1spt-BR!2sbr!4v1769184000835!5m2!1spt-BR!2sbr" width="600" height="450" style="border:0;" allowfullscreen="" loading="lazy" referrerpolicy="no-referrer-when-downgrade',
        pedagios: [ 
            { nome: "Pedágio Casimiro de Abreu", custo_eixo: 7.5 },
            { nome: "Pedágio Rio Bonito", custo_eixo: 7.5 },
            { nome: "Ponte São Gonçalo", custo_eixo: 7.5 },
        ]
    },
    'NITEROI': {
        km: 65,
        pedagios: [ { nome: "Pedágio Manilha", custo_eixo: 6.90 } ]
    },
    'CAMPOS': {
        km: 210,
        pedagios: [ 
            { nome: "Praça Casimiro", custo_eixo: 6.90 },
            { nome: "Praça Campos", custo_eixo: 6.90 }
        ]
    }
};

function buscarRotaInteligente(destino) {
    if (!destino) return null;
    const destinoLimpo = destino.toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, ""); 
    const chaves = Object.keys(TABELA_ROTAS_INTELIGENTE);
    for (let chave of chaves) {
        if (destinoLimpo.includes(chave)) return { nome: chave, ...TABELA_ROTAS_INTELIGENTE[chave] };
    }
    const infoPedagio = calcularCustoPedagio(destino);
    return { km: 0, pedagios: infoPedagio.lista, nome: destino };
}

window.abrirDetalhesRota = function(rotaCodificada, kmPlanilha) {
    try {
        const destinoBruto = decodeURIComponent(rotaCodificada || '');
        let destinoNome = destinoBruto.replace(/.*→/, '').trim(); 
        if (!destinoNome) destinoNome = "Destino Não Identificado";
        
        const dadosRota = buscarRotaInteligente(destinoNome);
        const kmReal = (dadosRota.km && dadosRota.km > 0) ? dadosRota.km : (kmPlanilha || 0);
        
        let total5Eixos = 0, total6Eixos = 0;
        let listaPedagiosHtml = '';
        const pedagios = dadosRota.pedagios || [];

        if (pedagios.length > 0) {
            listaPedagiosHtml = pedagios.map(p => {
                const custo = p.custo_eixo || 0; 
                total5Eixos += custo * 5;
                total6Eixos += custo * 6;
                return `<div class="toll-row"><span style="color:#ccc;">${p.nome || p}</span><span style="color:#fff;">${custo > 0 ? formatarMoeda(custo) + '/eixo' : 'Isento'}</span></div>`;
            }).join('');
        } else {
            listaPedagiosHtml = '<div style="color:#666; font-size:0.8rem; font-style:italic;">Nenhum pedágio cadastrado.</div>';
        }

        const modalContainer = document.getElementById('modalRotaContainer');
        const cardBody = modalContainer.querySelector('.card-body');
        
        const htmlMapa = `<div style="height:100%; display:flex; flex-direction:column; align-items:center; justify-content:center; color:#555; background:#111;"><i class="fas fa-map-marked-alt" style="font-size:3rem; margin-bottom:10px;"></i><span>Visualização de Mapa</span></div>`;

        cardBody.innerHTML = ''; 
        const divMapa = document.createElement('div');
        divMapa.className = 'route-map-col';
        divMapa.innerHTML = htmlMapa;
        cardBody.appendChild(divMapa);

        const divInfo = document.createElement('div');
        divInfo.className = 'route-info-col';
        divInfo.innerHTML = `
            <div class="info-scroll-area">
                <div class="route-box">
                    <div class="route-stop">
                        <div class="stop-icon"><i class="fas fa-circle" style="color:#fff; font-size:0.7rem; margin-top:4px;"></i><div class="stop-line"></div></div>
                        <div><strong style="color:#fff; display:block;">Areal Tosana</strong><small style="color:#888;">Origem</small></div>
                    </div>
                    <div class="route-stop">
                        <div class="stop-icon"><i class="fas fa-map-marker-alt" style="color:var(--cor-secundaria); font-size:1.1rem;"></i></div>
                        <div><strong style="color:#fff; display:block;">${destinoNome}</strong><small style="color:#888;">Destino (${formatarNumero(kmReal)} km)</small></div>
                    </div>
                </div>
                <div class="route-box">
                    <strong style="display:block; margin-bottom:10px; color:#FF6B35; text-transform:uppercase; font-size:0.75rem;"><i class="fas fa-ticket-alt"></i> Pedágios</strong>
                    <div class="toll-list">${listaPedagiosHtml}</div>
                </div>
            </div>
            <div class="info-footer">
                <div class="axle-grid">
                    <div class="axle-box"><span class="axle-title">Total 5 Eixos</span><div class="axle-price">${formatarMoeda(total5Eixos)}</div></div>
                    <div class="axle-box"><span class="axle-title">Total 6 Eixos</span><div class="axle-price">${formatarMoeda(total6Eixos)}</div></div>
                </div>
            </div>`;
        cardBody.appendChild(divInfo);
        abrirModalComHistorico('modalRotaContainer');
    } catch (erro) { console.error("Erro rota:", erro); }
}

function abrirDetalhesCliente(nomeCliente) {
    if (!dadosOriginais) return;
    const cabecalho = dadosOriginais[0];
    const colunas = detectarColunas(cabecalho);
    const idxCliente = colunas.find(c => c.tipo === 'cliente')?.indice;
    const idxData = colunas.find(c => c.tipo === 'data')?.indice;
    const idxValor = colunas.find(c => c.tipo === 'valor')?.indice;
    const idxMotorista = colunas.find(c => c.tipo === 'motorista')?.indice;
    const idxCavalo = colunas.find(c => c.tipo === 'veiculo')?.indice;
    
    const inicioInput = document.getElementById('dataInicio').value;
    const fimInput = document.getElementById('dataFim').value;
    let dInicio = inicioInput ? new Date(inicioInput + 'T00:00:00') : new Date(1900, 0, 1);
    let dFim = fimInput ? new Date(fimInput + 'T23:59:59') : new Date(2100, 0, 1);

    const diasMap = {};
    let totalPeriodo = 0;

    dadosOriginais.slice(1).forEach((linha) => {
        if (linha[idxCliente] === nomeCliente) {
            const dataObj = parsearDataBR(linha[idxData]);
            if (dataObj && dataObj >= dInicio && dataObj <= dFim) {
                const dataStr = dataObj.toLocaleDateString('pt-BR');
                const valor = idxValor !== undefined ? extrairNumero(linha[idxValor]) : 0;
                if (!diasMap[dataStr]) diasMap[dataStr] = { objData: dataObj, total: 0, viagens: [] };
                diasMap[dataStr].total += valor;
                diasMap[dataStr].viagens.push({
                    motorista: idxMotorista !== undefined ? (linha[idxMotorista] || '---') : '---',
                    cavalo: idxCavalo !== undefined ? (linha[idxCavalo] || '---') : '---',
                    valor: valor
                });
                totalPeriodo += valor;
            }
        }
    });

    const modal = document.getElementById('modalDetalheCliente');
    if(modal) {
        document.getElementById('mClienteNome').innerText = nomeCliente;
        document.getElementById('mClienteTotal').innerText = formatarMoeda(totalPeriodo);
        const container = document.getElementById('listaViagensAccordion');
        container.innerHTML = '';
        
        const diasOrdenados = Object.entries(diasMap).sort((a, b) => b[1].objData - a[1].objData);
        diasOrdenados.forEach(([data, info], index) => {
            const idUnico = `dia-${index}`;
            const htmlResumo = `
                <div class="day-summary-row" onclick="toggleDia('${idUnico}', this)">
                    <div class="day-info"><i class="fas fa-chevron-down toggle-icon"></i><span class="day-date">${data}</span><span class="day-count">${info.viagens.length} viagens</span></div>
                    <span class="day-total">${formatarMoeda(info.total)}</span>
                </div>`;
            let htmlDetalhes = `<div id="${idUnico}" class="day-details-box">`;
            info.viagens.forEach(v => {
                htmlDetalhes += `<div class="trip-card"><div class="t-driver"><i class="fas fa-user-tie"></i> ${v.motorista}</div><div class="t-plate"><i class="fas fa-truck"></i> ${v.cavalo}</div><div class="t-value">${formatarMoeda(v.valor)}</div></div>`;
            });
            htmlDetalhes += `</div>`;
            container.innerHTML += (htmlResumo + htmlDetalhes);
        });
        modal.style.display = 'flex';
        window.history.pushState({modalOpen: true}, "", "#detalheCliente");
    }
}

function toggleDia(idElemento, elementoClicado) {
    const detalhes = document.getElementById(idElemento);
    if (detalhes.style.display === 'block') { detalhes.style.display = 'none'; elementoClicado.classList.remove('active'); }
    else { detalhes.style.display = 'block'; elementoClicado.classList.add('active'); }
}

// ==========================================
// FUNÇÃO DE ORDENAÇÃO (FILTRO) COM CORREÇÃO DE DATAS
// ==========================================
let ordemAtual = {}; 

function ordenarRelatorio(tipo, campo) {
    if (!dadosAnalisados) return;
    const mapaListas = {
        'rotas': 'rotasOrdenadas',
        'motoristas': 'motoristasOrdenados',
        'veiculos': 'veiculosOrdenados',
        'clientes': 'clientesOrdenados',
        'diario': 'diasOrdenados' // Mapeamento do diário
    };
    const nomeLista = mapaListas[tipo];
    if (!nomeLista) return;

    if (!ordemAtual[tipo]) ordemAtual[tipo] = { campo: '', dir: 'desc' };
    if (ordemAtual[tipo].campo === campo) {
        ordemAtual[tipo].dir = ordemAtual[tipo].dir === 'desc' ? 'asc' : 'desc';
    } else {
        ordemAtual[tipo].campo = campo;
        ordemAtual[tipo].dir = 'desc'; 
    }
    const direcao = ordemAtual[tipo].dir === 'desc' ? -1 : 1;

    dadosAnalisados[nomeLista].sort((a, b) => {
        let valA, valB;
        
        // ORDENAÇÃO POR NOME/CHAVE
        if (campo === 'key') {
            // Se for data (diário), converte para objeto Date para ordenar corretamente
            if (tipo === 'diario') {
                const dateA = new Date(a[0].split('/').reverse().join('-'));
                const dateB = new Date(b[0].split('/').reverse().join('-'));
                // Se direcao é 1 (asc), menor data primeiro (a - b)
                // Se direcao é -1 (desc), maior data primeiro (b - a)
                return (dateA - dateB) * (direcao * -1); // * -1 para inverter padrão texto
            } else {
                valA = a[0]; valB = b[0];
                return valA.localeCompare(valB) * (direcao * -1); 
            }
        } 
        // ORDENAÇÃO POR VALORES NUMÉRICOS
        else {
            valA = a[1][campo]; valB = b[1][campo];
            return (valA - valB) * direcao;
        }
    });
    mostrarRelatorio(tipo);
}

// ==========================================
// INICIALIZAÇÃO
// ==========================================
function aplicarFiltroData() {
    if (!dadosOriginais) { mostrarNotificacao('❌ Dados não carregados', 'error'); return; }
    const inicio = document.getElementById('dataInicio').value;
    const fim = document.getElementById('dataFim').value;
    
    if (!inicio && !fim) {
        dadosAnalisados = analisarDadosMineramix(dadosOriginais);
        mostrarRelatorio(document.querySelector('.menu-item.active').getAttribute('data-report'));
        return;
    }
    if (!inicio || !fim) { mostrarNotificacao('⚠️ Selecione ambas as datas', 'error'); return; }
    
    const [anoI, mesI, diaI] = inicio.split('-').map(Number);
    const dataInicio = new Date(anoI, mesI - 1, diaI, 0, 0, 0, 0);
    const [anoF, mesF, diaF] = fim.split('-').map(Number);
    const dataFim = new Date(anoF, mesF - 1, diaF, 23, 59, 59, 999);
    
    const linhas = dadosOriginais.slice(1).filter(linha => {
        const data = parsearDataBR(linha[indiceColunaData]);
        return data && data >= dataInicio && data <= dataFim;
    });
    
    dadosAnalisados = analisarDadosMineramix([dadosOriginais[0], ...linhas]);
    mostrarRelatorio(document.querySelector('.menu-item.active').getAttribute('data-report'));
}

async function testarConexao() {
    try {
        atualizarStatus(false, '🔄 Testando...');
        const resp = await fetch(CONFIG.API_URL);
        if(resp.ok) { atualizarStatus(true, '✅ Online'); mostrarNotificacao('Conexão OK', 'success'); }
    } catch(e) { atualizarStatus(false, '❌ Offline'); }
}

async function carregarDados() {
    try {
        atualizarStatus(false, '🔄 Conectando...');
        const resp = await fetch(CONFIG.API_URL);
        const json = await resp.json();
        dadosOriginais = json.dados;
        dadosCombustivelOriginais = json.dadosCombustivel;
        
        const cols = detectarColunas(dadosOriginais[0]);
        indiceColunaData = cols.find(c => c.tipo === 'data').indice;
        
        dadosAnalisados = analisarDadosMineramix(dadosOriginais);
        mostrarRelatorio('overview');
        atualizarStatus(true, '✅ Online');
    } catch (e) {
        console.error(e);
        atualizarStatus(false, '❌ Erro');
    }
}

document.addEventListener('DOMContentLoaded', function() {
    document.querySelectorAll('.menu-item').forEach(item => {
        item.addEventListener('click', function() {
            const report = this.getAttribute('data-report');
            if (report) mostrarRelatorio(report);
            if (this.id === 'btn-refresh') carregarDados();
        });
    });
    if (localStorage.getItem('darkMode') === 'on') toggleDarkMode();
    carregarDados();
});

// EXPORTAÇÕES GLOBAIS
window.ordenarRelatorio = ordenarRelatorio;
window.abrirDetalhesCliente = abrirDetalhesCliente;
window.toggleDia = toggleDia;
window.fecharModalVeiculo = fecharModalVeiculo;
window.abrirDetalhesVeiculo = abrirDetalhesVeiculo;
window.abrirDetalhesMotorista = abrirDetalhesMotorista;
window.fecharModal = fecharModal;
window.fecharModalMotorista = fecharModalMotorista;
window.fecharModalCliente = fecharModalCliente;
window.abrirDetalhesDia = abrirDetalhesDia;
window.aplicarFiltroData = aplicarFiltroData; 
window.carregarDados = carregarDados;
window.testarConexao = testarConexao; 
window.toggleDarkMode = toggleDarkMode;
window.fecharModalRota = fecharModalRota;
window.abrirDetalhesRota = abrirDetalhesRota;
