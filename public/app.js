// --- STATE & GLOBAL VARIABLES ---
let state = {
    coordenadorias: [],
    colaboradores: [],
    projetos: [],
    tarefas: [],
    gerencias: [],
    currentTab: 'dashboard-tab'
};

// --- DOM ELEMENTS ---
const elements = {
    tabs: document.querySelectorAll('.tab-content'),
    menuItems: document.querySelectorAll('.menu-item'),
    pageTitle: document.getElementById('page-title'),
    pageSubtitle: document.getElementById('page-subtitle'),
    
    // KPIs
    kpiActiveProjects: document.getElementById('kpi-active-projects'),
    kpiPendingTasks: document.getElementById('kpi-pending-tasks'),
    kpiTotalCollaborators: document.getElementById('kpi-total-collaborators'),
    kpiTotalHours: document.getElementById('kpi-total-hours'),
    
    // Lists & Containers
    dashboardProjectsList: document.getElementById('dashboard-projects-list'),
    projectsListContainer: document.getElementById('projects-list-container'),
    tasksTodoContainer: document.getElementById('tasks-todo-container'),
    tasksProgressContainer: document.getElementById('tasks-progress-container'),
    tasksDoneContainer: document.getElementById('tasks-done-container'),
    collaboratorsList: document.getElementById('collaborators-list'),
    coordinationsList: document.getElementById('coordinations-list'),
    managementsList: document.getElementById('managements-list'),
    
    // Filters & Search
    projectSearch: document.getElementById('project-search'),
    taskProjectFilter: document.getElementById('task-project-filter'),
    reportMonth: document.getElementById('report-month'),
    reportYear: document.getElementById('report-year'),
    
    // Modals
    modalProject: document.getElementById('modal-project'),
    modalTask: document.getElementById('modal-task'),
    modalCollaborator: document.getElementById('modal-collaborator'),
    modalCoordination: document.getElementById('modal-coordination'),
    modalManagement: document.getElementById('modal-management'),
    modalEditTaskStatus: document.getElementById('modal-edit-task-status'),
    
    // Forms
    formProject: document.getElementById('form-project'),
    formTask: document.getElementById('form-task'),
    formCollaborator: document.getElementById('form-collaborator'),
    formCoordination: document.getElementById('form-coordination'),
    formManagement: document.getElementById('form-management'),
    formEditTaskStatus: document.getElementById('form-edit-task-status')
};

// --- INITIALIZATION ---
document.addEventListener('DOMContentLoaded', () => {
    initApp();
    setupEventListeners();
});

async function initApp() {
    // Set default month/year for reports to current date
    const today = new Date();
    elements.reportMonth.value = today.getMonth() + 1; // 1-indexed
    elements.reportYear.value = today.getFullYear();

    // Fetch initial backend data
    await loadBaseData();
    renderCurrentTab();
}

async function loadBaseData() {
    try {
        const [resCoord, resColab, resProj, resTasks, resGerencias] = await Promise.all([
            fetch('/api/coordenadorias').then(r => r.json()),
            fetch('/api/colaboradores').then(r => r.json()),
            fetch('/api/projetos').then(r => r.json()),
            fetch('/api/tarefas').then(r => r.json()),
            fetch('/api/gerencias').then(r => r.json())
        ]);

        state.coordenadorias = resCoord;
        state.colaboradores = resColab;
        state.projetos = resProj;
        state.tarefas = resTasks;
        state.gerencias = resGerencias;

        // Update filters and dropdowns
        populateDropdowns();
        updateDashboardKPIs();
    } catch (err) {
        console.error('Error loading data:', err);
    }
}

// --- TAB ROUTING ---
function setupEventListeners() {
    // Menu Tab Navigation
    elements.menuItems.forEach(item => {
        item.addEventListener('click', (e) => {
            e.preventDefault();
            const tabId = item.getAttribute('data-tab');
            switchTab(tabId);
        });
    });

    // Modal Triggers (Open)
    document.getElementById('btn-add-project').addEventListener('click', () => openModal(elements.modalProject));
    document.getElementById('btn-dashboard-add-project').addEventListener('click', () => openModal(elements.modalProject));
    document.getElementById('btn-add-task').addEventListener('click', () => {
        document.getElementById('task-modal-title').textContent = "Criar Nova Tarefa";
        document.getElementById('task-id').value = '';
        openModal(elements.modalTask);
    });
    document.getElementById('btn-add-collaborator').addEventListener('click', () => {
        document.getElementById('colab-modal-title').textContent = "Adicionar Novo Colaborador";
        document.getElementById('colab-id').value = '';
        openModal(elements.modalCollaborator);
    });
    document.getElementById('btn-add-coordination').addEventListener('click', () => {
        document.getElementById('coord-modal-title').textContent = "Registrar Coordenadoria";
        document.getElementById('coord-id').value = '';
        openModal(elements.modalCoordination);
    });
    document.getElementById('btn-add-management').addEventListener('click', () => {
        document.getElementById('mgmt-modal-title').textContent = "Registrar Gerência";
        document.getElementById('mgmt-id').value = '';
        openModal(elements.modalManagement);
    });

    // Modal Close buttons
    document.getElementById('btn-close-project-modal').addEventListener('click', () => closeModal(elements.modalProject));
    document.getElementById('btn-cancel-project').addEventListener('click', () => closeModal(elements.modalProject));
    
    document.getElementById('btn-close-task-modal').addEventListener('click', () => closeModal(elements.modalTask));
    document.getElementById('btn-cancel-task').addEventListener('click', () => closeModal(elements.modalTask));
    
    document.getElementById('btn-close-colab-modal').addEventListener('click', () => closeModal(elements.modalCollaborator));
    document.getElementById('btn-cancel-colab').addEventListener('click', () => closeModal(elements.modalCollaborator));
    
    document.getElementById('btn-close-coord-modal').addEventListener('click', () => closeModal(elements.modalCoordination));
    document.getElementById('btn-cancel-coord').addEventListener('click', () => closeModal(elements.modalCoordination));

    document.getElementById('btn-close-mgmt-modal').addEventListener('click', () => closeModal(elements.modalManagement));
    document.getElementById('btn-cancel-mgmt').addEventListener('click', () => closeModal(elements.modalManagement));

    document.getElementById('btn-close-edit-task-modal').addEventListener('click', () => closeModal(elements.modalEditTaskStatus));
    document.getElementById('btn-cancel-edit-task').addEventListener('click', () => closeModal(elements.modalEditTaskStatus));
    document.getElementById('btn-delete-task-action').addEventListener('click', handleDeleteTaskAction);
    document.getElementById('btn-edit-task-details-action').addEventListener('click', handleEditTaskDetailsAction);

    // Form Submits
    elements.formProject.addEventListener('submit', handleProjectSubmit);
    elements.formTask.addEventListener('submit', handleTaskSubmit);
    elements.formCollaborator.addEventListener('submit', handleCollaboratorSubmit);
    elements.formCoordination.addEventListener('submit', handleCoordinationSubmit);
    elements.formManagement.addEventListener('submit', handleManagementSubmit);
    elements.formEditTaskStatus.addEventListener('submit', handleEditTaskStatusSubmit);

    // Filters and Search
    elements.projectSearch.addEventListener('input', renderProjectsTab);
    elements.taskProjectFilter.addEventListener('change', renderTasksTab);
    
    // Reports trigger
    document.getElementById('btn-generate-report').addEventListener('click', generateMonthlyReport);
    document.getElementById('btn-print-report').addEventListener('click', () => window.print());
}

function switchTab(tabId) {
    state.currentTab = tabId;
    elements.menuItems.forEach(item => {
        if (item.getAttribute('data-tab') === tabId) {
            item.classList.add('active');
        } else {
            item.classList.remove('active');
        }
    });

    elements.tabs.forEach(tab => {
        if (tab.id === tabId) {
            tab.classList.add('active');
        } else {
            tab.classList.remove('active');
        }
    });

    // Update Page Header Titles
    switch (tabId) {
        case 'dashboard-tab':
            elements.pageTitle.textContent = "Painel Geral";
            elements.pageSubtitle.textContent = "Visão unificada das coordenadorias e projetos";
            break;
        case 'projects-tab':
            elements.pageTitle.textContent = "Projetos";
            elements.pageSubtitle.textContent = "Planejamento e acompanhamento de projetos estratégicos";
            break;
        case 'tasks-tab':
            elements.pageTitle.textContent = "Quadro de Tarefas";
            elements.pageSubtitle.textContent = "Gerenciamento visual e sub-tarefas por projeto";
            break;
        case 'team-tab':
            elements.pageTitle.textContent = "Equipes & Setores";
            elements.pageSubtitle.textContent = "Controle das Coordenadorias e de colaboradores";
            break;
        case 'closing-tab':
            elements.pageTitle.textContent = "Fechamento Mensal";
            elements.pageSubtitle.textContent = "Apontamento e consolidação de entregas e horas por mês";
            break;
    }

    renderCurrentTab();
}

function renderCurrentTab() {
    switch (state.currentTab) {
        case 'dashboard-tab':
            renderDashboardTab();
            break;
        case 'projects-tab':
            renderProjectsTab();
            break;
        case 'tasks-tab':
            renderTasksTab();
            break;
        case 'team-tab':
            renderTeamTab();
            break;
        case 'closing-tab':
            // Generate report automatically for current selected values
            generateMonthlyReport();
            break;
    }
}

// --- HELPER DYNAMIC OPTIONS ---
function populateDropdowns() {
    // Project Coordinations dropdown
    const projCoordSelect = document.getElementById('project-coordination');
    const colabCoordSelect = document.getElementById('colab-coordination');
    const taskAssigneeSelect = document.getElementById('task-assignee');
    const taskProjectSelect = document.getElementById('task-project');
    const taskProjectFilter = elements.taskProjectFilter;
    const coordGerenciaSelect = document.getElementById('coord-gerencia');

    // Coordinations option
    let coordOptionsHtml = '<option value="" disabled selected>Escolha uma coordenadoria...</option>';
    state.coordenadorias.forEach(c => {
        coordOptionsHtml += `<option value="${c.id}">${c.sigla} - ${c.nome}</option>`;
    });
    projCoordSelect.innerHTML = coordOptionsHtml;
    colabCoordSelect.innerHTML = coordOptionsHtml;

    // Collaborators option
    let colabOptionsHtml = '<option value="" disabled selected>Escolha um responsável...</option>';
    state.colaboradores.forEach(c => {
        colabOptionsHtml += `<option value="${c.id}">${c.nome} (${c.coordenadoria_sigla || 'Sem Setor'})</option>`;
    });
    taskAssigneeSelect.innerHTML = colabOptionsHtml;

    // Projects option
    let projOptionsHtml = '<option value="" disabled selected>Escolha um projeto...</option>';
    let projFilterHtml = '<option value="all">Todos os Projetos</option>';
    state.projetos.forEach(p => {
        projOptionsHtml += `<option value="${p.id}">${p.nome}</option>`;
        projFilterHtml += `<option value="${p.id}">${p.nome}</option>`;
    });
    taskProjectSelect.innerHTML = projOptionsHtml;
    taskProjectFilter.innerHTML = projFilterHtml;

    // Gerências option
    if (coordGerenciaSelect) {
        let gerenciaOptionsHtml = '<option value="" disabled selected>Escolha uma gerência...</option>';
        state.gerencias.forEach(g => {
            gerenciaOptionsHtml += `<option value="${g.id}">${g.sigla} - ${g.nome}</option>`;
        });
        coordGerenciaSelect.innerHTML = gerenciaOptionsHtml;
    }

    // Subtask collaborator select option
    const newSubtaskAssigneeSelect = document.getElementById('new-subtask-assignee');
    if (newSubtaskAssigneeSelect) {
        let subtaskColabHtml = '<option value="">Sem Colaborador</option>';
        state.colaboradores.forEach(c => {
            subtaskColabHtml += `<option value="${c.id}">${c.nome}</option>`;
        });
        newSubtaskAssigneeSelect.innerHTML = subtaskColabHtml;
    }
}

async function updateDashboardKPIs() {
    try {
        const summary = await fetch('/api/dashboard/summary').then(r => r.json());
        elements.kpiActiveProjects.textContent = summary.activeProjects;
        elements.kpiPendingTasks.textContent = summary.pendingTasks;
        elements.kpiTotalCollaborators.textContent = summary.totalCollaborators;
        elements.kpiTotalHours.textContent = `${Math.round(summary.totalHoursWorked)}h`;
    } catch (err) {
        console.error('Error updating KPIs:', err);
    }
}

// --- MODALS FUNCTIONS ---
function openModal(modal) {
    modal.classList.add('active');
}

function closeModal(modal) {
    modal.classList.remove('active');
    // Clear forms inside modal
    const form = modal.querySelector('form');
    if (form) form.reset();
}

// --- 1. RENDERING: DASHBOARD TAB ---
function renderDashboardTab() {
    updateDashboardKPIs();
    
    // Sort projects to display top 5 recent projects
    const recentProjects = [...state.projetos].slice(0, 5);
    let html = '';
    
    if (recentProjects.length === 0) {
        html = '<tr><td colspan="5" style="text-align: center; color: var(--text-muted);">Nenhum projeto cadastrado ainda.</td></tr>';
    } else {
        recentProjects.forEach(p => {
            const percent = p.total_tasks > 0 ? Math.round((p.completed_tasks / p.total_tasks) * 100) : 0;
            const formattedDate = new Date(p.data_inicio).toLocaleDateString('pt-BR');
            html += `
                <tr>
                    <td style="font-weight: 600;">${p.nome}</td>
                    <td><span class="project-coord-badge">${p.coordenadoria_sigla || 'N/A'}</span></td>
                    <td style="color: var(--text-secondary);">${formattedDate}</td>
                    <td>
                        <div class="project-progress-container" style="margin-bottom: 0; min-width: 120px;">
                            <div class="progress-header" style="margin-bottom: 4px;">
                                <span>${percent}%</span>
                            </div>
                            <div class="progress-bar-bg" style="height: 4px;">
                                <div class="progress-bar-fill" style="width: ${percent}%;"></div>
                            </div>
                        </div>
                    </td>
                    <td><span class="badge ${getStatusClass(p.status)}">${p.status}</span></td>
                </tr>
            `;
        });
    }
    elements.dashboardProjectsList.innerHTML = html;
}

// --- 2. RENDERING: PROJECTS TAB ---
function renderProjectsTab() {
    const searchVal = elements.projectSearch.value.toLowerCase();
    
    const filteredProjects = state.projetos.filter(p => 
        p.nome.toLowerCase().includes(searchVal) || 
        (p.descricao && p.descricao.toLowerCase().includes(searchVal)) ||
        (p.coordenadoria_sigla && p.coordenadoria_sigla.toLowerCase().includes(searchVal))
    );

    let html = '';

    if (filteredProjects.length === 0) {
        html = `
            <div style="grid-column: 1 / -1; text-align: center; padding: 40px; color: var(--text-muted);">
                <i class="fa-solid fa-folder-open" style="font-size: 40px; margin-bottom: 10px;"></i>
                <p>Nenhum projeto encontrado.</p>
            </div>
        `;
    } else {
        filteredProjects.forEach(p => {
            const percent = p.total_tasks > 0 ? Math.round((p.completed_tasks / p.total_tasks) * 100) : 0;
            const startStr = new Date(p.data_inicio).toLocaleDateString('pt-BR');
            const endStr = p.data_fim ? new Date(p.data_fim).toLocaleDateString('pt-BR') : 'Sem Prazo';

            html += `
                <div class="project-card glass">
                    <div class="project-card-header">
                        <div>
                            <h4>${p.nome}</h4>
                            <span class="project-coord-badge" style="margin-top: 6px; display: inline-block;">
                                ${p.coordenadoria_sigla || 'Sem Coord.'}
                            </span>
                        </div>
                        <span class="badge ${getStatusClass(p.status)}">${p.status}</span>
                    </div>
                    <p class="project-desc">${p.descricao || 'Sem descrição inserida.'}</p>
                    <div class="project-dates">
                        <span><i class="fa-regular fa-calendar-check"></i> Início: ${startStr}</span>
                        <span><i class="fa-regular fa-calendar-xmark"></i> Fim: ${endStr}</span>
                    </div>
                    <div class="project-progress-container">
                        <div class="progress-header">
                            <span>Progresso Geral</span>
                            <span>${p.completed_tasks}/${p.total_tasks} Tarefas (${percent}%)</span>
                        </div>
                        <div class="progress-bar-bg">
                            <div class="progress-bar-fill" style="width: ${percent}%;"></div>
                        </div>
                    </div>
                    <div class="project-card-footer">
                        <span style="font-size: 11px; color: var(--text-muted); font-weight: 500;">
                            ID: #${p.id}
                        </span>
                        <div class="project-card-actions">
                            <button class="btn btn-secondary btn-sm" onclick="editProject(${p.id})">
                                <i class="fa-solid fa-pen"></i> Editar
                            </button>
                            <button class="btn btn-danger btn-sm" onclick="deleteProject(${p.id})">
                                <i class="fa-solid fa-trash"></i> Excluir
                            </button>
                        </div>
                    </div>
                </div>
            `;
        });
    }
    elements.projectsListContainer.innerHTML = html;
}

// --- 3. RENDERING: KANBAN BOARD ---
function renderTasksTab() {
    const projectFilter = elements.taskProjectFilter.value;
    
    // Filter tasks
    const filteredTasks = state.tarefas.filter(t => 
        projectFilter === 'all' || t.projeto_id == projectFilter
    );

    // Clear board columns
    elements.tasksTodoContainer.innerHTML = '';
    elements.tasksProgressContainer.innerHTML = '';
    elements.tasksDoneContainer.innerHTML = '';

    let todoCount = 0;
    let progressCount = 0;
    let doneCount = 0;

    filteredTasks.forEach(t => {
        const cardHtml = `
            <div class="task-card" onclick="openEditTaskModal(${t.id})">
                <div class="task-card-header">
                    <span class="task-project-name">${t.projeto_nome}</span>
                    <span class="task-priority priority-${t.prioridade.toLowerCase()}">${t.prioridade}</span>
                </div>
                <h5>${t.titulo}</h5>
                <p>${t.descricao || 'Sem descrição.'}</p>
                <div class="task-card-footer">
                    <div class="task-assignee">
                        <i class="fa-solid fa-circle-user"></i>
                        <span>${t.colaborador_nome || 'Sem Responsável'}</span>
                    </div>
                    <span class="task-hours">${Math.round(t.horas_trabalhadas)}/${Math.round(t.horas_estimadas)}h</span>
                </div>
            </div>
        `;

        if (t.status === 'A Fazer') {
            elements.tasksTodoContainer.insertAdjacentHTML('beforeend', cardHtml);
            todoCount++;
        } else if (t.status === 'Em Progresso') {
            elements.tasksProgressContainer.insertAdjacentHTML('beforeend', cardHtml);
            progressCount++;
        } else if (t.status === 'Concluída') {
            elements.tasksDoneContainer.insertAdjacentHTML('beforeend', cardHtml);
            doneCount++;
        }
    });

    // Update Counts
    document.getElementById('count-todo').textContent = todoCount;
    document.getElementById('count-progress').textContent = progressCount;
    document.getElementById('count-done').textContent = doneCount;
}

// --- 4. RENDERING: TEAM & COORD TAB ---
function renderTeamTab() {
    // Render Collaborators
    let colabHtml = '';
    if (state.colaboradores.length === 0) {
        colabHtml = '<tr><td colspan="5" style="text-align: center; color: var(--text-muted);">Nenhum colaborador registrado.</td></tr>';
    } else {
        state.colaboradores.forEach(c => {
            colabHtml += `
                <tr>
                    <td style="font-weight: 600;">${c.nome}</td>
                    <td>${c.cargo}</td>
                    <td>${c.email}</td>
                    <td><span class="project-coord-badge">${c.coordenadoria_sigla || 'Sem Coord.'}</span></td>
                    <td style="text-align: right;">
                        <button class="btn btn-secondary btn-sm" onclick="editCollaborator(${c.id})" style="padding: 4px 8px; margin-right: 4px;">
                            <i class="fa-solid fa-pen" style="font-size: 11px;"></i>
                        </button>
                        <button class="btn btn-danger btn-sm" onclick="deleteCollaborator(${c.id})" style="padding: 4px 8px;">
                            <i class="fa-solid fa-trash" style="font-size: 11px;"></i>
                        </button>
                    </td>
                </tr>
            `;
        });
    }
    elements.collaboratorsList.innerHTML = colabHtml;

    // Render Coordinations
    let coordHtml = '';
    if (state.coordenadorias.length === 0) {
        coordHtml = '<tr><td colspan="4" style="text-align: center; color: var(--text-muted);">Nenhuma coordenadoria.</td></tr>';
    } else {
        state.coordenadorias.forEach(c => {
            coordHtml += `
                <tr>
                    <td style="font-weight: 700; color: var(--primary-hover);">${c.sigla}</td>
                    <td>${c.nome}</td>
                    <td><span class="project-coord-badge">${c.gerencia_sigla || 'Sem Gerência'}</span></td>
                    <td style="text-align: right;">
                        <button class="btn btn-secondary btn-sm" onclick="editCoordination(${c.id})" style="padding: 4px 8px; margin-right: 4px;">
                            <i class="fa-solid fa-pen" style="font-size: 11px;"></i>
                        </button>
                        <button class="btn btn-danger btn-sm" onclick="deleteCoordination(${c.id})" style="padding: 4px 8px;">
                            <i class="fa-solid fa-trash" style="font-size: 11px;"></i>
                        </button>
                    </td>
                </tr>
            `;
        });
    }
    elements.coordinationsList.innerHTML = coordHtml;

    // Render Managements
    let mgmtHtml = '';
    if (state.gerencias.length === 0) {
        mgmtHtml = '<tr><td colspan="3" style="text-align: center; color: var(--text-muted);">Nenhuma gerência.</td></tr>';
    } else {
        state.gerencias.forEach(g => {
            mgmtHtml += `
                <tr>
                    <td style="font-weight: 700; color: var(--accent-blue);">${g.sigla}</td>
                    <td>${g.nome}</td>
                    <td style="text-align: right;">
                        <button class="btn btn-secondary btn-sm" onclick="editManagement(${g.id})" style="padding: 4px 8px; margin-right: 4px;">
                            <i class="fa-solid fa-pen" style="font-size: 11px;"></i>
                        </button>
                        <button class="btn btn-danger btn-sm" onclick="deleteManagement(${g.id})" style="padding: 4px 8px;">
                            <i class="fa-solid fa-trash" style="font-size: 11px;"></i>
                        </button>
                    </td>
                </tr>
            `;
        });
    }
    elements.managementsList.innerHTML = mgmtHtml;
}

// --- 5. RENDERING: MONTHLY CLOSING REPORT ---
async function generateMonthlyReport() {
    const mes = elements.reportMonth.value;
    const ano = elements.reportYear.value;

    // Set header labels for report
    const monthText = elements.reportMonth.options[elements.reportMonth.selectedIndex].text;
    const periodStr = `${monthText} / ${ano}`;
    document.getElementById('project-report-period').textContent = periodStr;
    document.getElementById('collaborator-report-period').textContent = periodStr;

    try {
        const report = await fetch(`/api/relatorios/fechamento?mes=${mes}&ano=${ano}`).then(r => r.json());

        // Render Projects Summary
        let projHtml = '';
        if (report.projetos.length === 0) {
            projHtml = '<tr><td colspan="7" style="text-align: center; color: var(--text-muted);">Nenhuma tarefa agendada ou executada para este período.</td></tr>';
        } else {
            report.projetos.forEach(p => {
                const estHours = p.total_horas_estimadas ? Math.round(p.total_horas_estimadas) : 0;
                const workedHours = p.total_horas_trabalhadas ? Math.round(p.total_horas_trabalhadas) : 0;
                
                projHtml += `
                    <tr>
                        <td style="font-weight: 600;">${p.projeto_nome}</td>
                        <td><span class="project-coord-badge">${p.coordenadoria_sigla || 'N/A'}</span></td>
                        <td>${p.total_tarefas}</td>
                        <td><span style="color: var(--accent-green); font-weight: 600;">${p.tarefas_concluidas}</span></td>
                        <td>${estHours}h</td>
                        <td style="font-weight: 600;">${workedHours}h</td>
                        <td>${p.colaboradores_alocados} membros</td>
                    </tr>
                `;
            });
        }
        document.getElementById('report-projects-body').innerHTML = projHtml;

        // Render Collaborators Summary
        let colabHtml = '';
        if (report.colaboradores.length === 0) {
            colabHtml = '<tr><td colspan="6" style="text-align: center; color: var(--text-muted);">Nenhum colaborador realizou lançamentos neste período.</td></tr>';
        } else {
            report.colaboradores.forEach(c => {
                const workedHours = c.total_horas_trabalhadas ? Math.round(c.total_horas_trabalhadas) : 0;
                
                colabHtml += `
                    <tr>
                        <td style="font-weight: 600;">${c.colaborador_nome}</td>
                        <td><span class="project-coord-badge">${c.coordenadoria_sigla || 'N/A'}</span></td>
                        <td>${c.total_projetos} projetos</td>
                        <td>${c.total_tarefas}</td>
                        <td><span style="color: var(--accent-green); font-weight: 600;">${c.tarefas_concluidas}</span></td>
                        <td style="font-weight: 600;">${workedHours}h</td>
                    </tr>
                `;
            });
        }
        document.getElementById('report-collaborators-body').innerHTML = colabHtml;
    } catch (err) {
        console.error('Error generating report:', err);
    }
}

// --- FORM HANDLING: SUBMITS ---

async function handleProjectSubmit(e) {
    e.preventDefault();
    const id = document.getElementById('project-id').value;
    const payload = {
        nome: document.getElementById('project-name').value,
        descricao: document.getElementById('project-desc').value,
        data_inicio: document.getElementById('project-start').value,
        data_fim: document.getElementById('project-end').value,
        coordenadoria_id: document.getElementById('project-coordination').value,
        status: document.getElementById('project-status').value
    };

    try {
        let res;
        if (id) {
            // Edit mode
            res = await fetch(`/api/projetos/${id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            }).then(r => r.json());
        } else {
            // Create mode
            res = await fetch('/api/projetos', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            }).then(r => r.json());
        }

        closeModal(elements.modalProject);
        await loadBaseData();
        renderCurrentTab();
    } catch (err) {
        console.error('Error submitting project:', err);
    }
}

async function handleTaskSubmit(e) {
    e.preventDefault();
    const id = document.getElementById('task-id').value;
    const payload = {
        projeto_id: document.getElementById('task-project').value,
        titulo: document.getElementById('task-title').value,
        descricao: document.getElementById('task-desc').value,
        prioridade: document.getElementById('task-priority').value,
        colaborador_id: document.getElementById('task-assignee').value,
        data_entrega: document.getElementById('task-deadline').value,
        horas_estimadas: parseFloat(document.getElementById('task-est-hours').value),
        horas_trabalhadas: parseFloat(document.getElementById('task-worked-hours').value)
    };

    try {
        if (id) {
            // Edit mode
            await fetch(`/api/tarefas/${id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
        } else {
            // Create mode
            await fetch('/api/tarefas', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
        }

        closeModal(elements.modalTask);
        await loadBaseData();
        renderCurrentTab();
    } catch (err) {
        console.error('Error submitting task:', err);
    }
}

async function handleCollaboratorSubmit(e) {
    e.preventDefault();
    const id = document.getElementById('colab-id').value;
    const payload = {
        nome: document.getElementById('colab-name').value,
        email: document.getElementById('colab-email').value,
        cargo: document.getElementById('colab-role').value,
        coordenadoria_id: document.getElementById('colab-coordination').value
    };

    try {
        let res;
        if (id) {
            // Edit mode
            res = await fetch(`/api/colaboradores/${id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            }).then(r => r.json());
        } else {
            // Create mode
            res = await fetch('/api/colaboradores', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            }).then(r => r.json());
        }

        closeModal(elements.modalCollaborator);
        await loadBaseData();
        renderCurrentTab();
    } catch (err) {
        console.error('Error submitting collaborator:', err);
    }
}

async function handleCoordinationSubmit(e) {
    e.preventDefault();
    const id = document.getElementById('coord-id').value;
    const payload = {
        sigla: document.getElementById('coord-sigla').value,
        nome: document.getElementById('coord-name').value,
        gerencia_id: parseInt(document.getElementById('coord-gerencia').value)
    };

    try {
        let res;
        if (id) {
            // Edit mode
            res = await fetch(`/api/coordenadorias/${id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            }).then(r => r.json());
        } else {
            // Create mode
            res = await fetch('/api/coordenadorias', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            }).then(r => r.json());
        }

        closeModal(elements.modalCoordination);
        await loadBaseData();
        renderCurrentTab();
    } catch (err) {
        console.error('Error creating coordination:', err);
    }
}

async function handleManagementSubmit(e) {
    e.preventDefault();
    const id = document.getElementById('mgmt-id').value;
    const payload = {
        sigla: document.getElementById('mgmt-sigla').value,
        nome: document.getElementById('mgmt-name').value
    };

    try {
        let res;
        if (id) {
            // Edit mode
            res = await fetch(`/api/gerencias/${id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            }).then(r => r.json());
        } else {
            // Create mode
            res = await fetch('/api/gerencias', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            }).then(r => r.json());
        }

        closeModal(elements.modalManagement);
        await loadBaseData();
        renderCurrentTab();
    } catch (err) {
        console.error('Error submitting management:', err);
    }
}

// --- TASK EDIT POPUP / PROGRESS MODAL ---
window.openEditTaskModal = async function(taskId) {
    const task = state.tarefas.find(t => t.id === taskId);
    if (!task) return;

    document.getElementById('edit-task-id').value = task.id;
    document.getElementById('edit-task-title-display').textContent = task.titulo;
    document.getElementById('edit-task-status-select').value = task.status;
    document.getElementById('edit-task-worked-hours').value = task.horas_trabalhadas;

    // Set default assignee for new subtasks to the task's assignee
    const subtaskAssigneeSelect = document.getElementById('new-subtask-assignee');
    if (subtaskAssigneeSelect) {
        subtaskAssigneeSelect.value = task.colaborador_id || '';
    }

    // Load subtasks list
    await loadAndRenderSubtasks(task.id);
    
    openModal(elements.modalEditTaskStatus);
};

async function loadAndRenderSubtasks(taskId) {
    const listEl = document.getElementById('edit-task-subtasks-list');
    listEl.innerHTML = '';

    try {
        const subtasks = await fetch(`/api/subtarefas/${taskId}`).then(r => r.json());
        
        if (subtasks.length === 0) {
            listEl.innerHTML = '<li style="color: var(--text-muted); font-size: 13px;">Sem sub-tarefas cadastradas.</li>';
        } else {
            subtasks.forEach(s => {
                const item = document.createElement('li');
                item.className = `subtask-item ${s.concluida ? 'completed' : ''}`;
                
                // Build options for collaborators list
                let optionsHtml = '<option value="">Sem Colaborador</option>';
                state.colaboradores.forEach(c => {
                    optionsHtml += `<option value="${c.id}" ${c.id === s.colaborador_id ? 'selected' : ''}>${c.nome}</option>`;
                });

                item.innerHTML = `
                    <input type="checkbox" ${s.concluida ? 'checked' : ''} onchange="toggleSubtask(${s.id}, this.checked)">
                    <span>${s.titulo}</span>
                    <select onchange="updateSubtaskCollaborator(${s.id}, this.value)" class="subtask-colab-select">
                        ${optionsHtml}
                    </select>
                    <button type="button" class="btn btn-secondary btn-sm" onclick="editSubtask(${s.id})" style="padding: 2px 6px; font-size: 10px; background: transparent; border: none; margin-left: 8px;">
                        <i class="fa-solid fa-pen" style="font-size: 10px; color: var(--text-secondary);"></i>
                    </button>
                    <button type="button" class="btn btn-danger btn-sm" onclick="deleteSubtask(${s.id})" style="padding: 2px 6px; font-size: 10px; background: transparent; border: none; margin-left: 2px;">
                        <i class="fa-solid fa-trash-can" style="font-size: 10px; color: var(--accent-red);"></i>
                    </button>
                `;
                listEl.appendChild(item);
            });
        }
    } catch (err) {
        console.error('Error loading subtasks:', err);
    }
}

// Toggle subtask checkbox
window.toggleSubtask = async function(subtaskId, isChecked) {
    try {
        await fetch(`/api/subtarefas/${subtaskId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ concluida: isChecked })
        });
        
        // Reload base tasks data to update progression calculation
        const resTasks = await fetch('/api/tarefas').then(r => r.json());
        state.tarefas = resTasks;
        
        // Reload current modal subtasks view
        const taskId = parseInt(document.getElementById('edit-task-id').value);
        await loadAndRenderSubtasks(taskId);
        renderCurrentTab();
    } catch (err) {
        console.error('Error toggling subtask:', err);
    }
};

// Update subtask collaborator from inline selector
window.updateSubtaskCollaborator = async function(subtaskId, collaboratorId) {
    try {
        const taskId = parseInt(document.getElementById('edit-task-id').value);
        const subtasks = await fetch(`/api/subtarefas/${taskId}`).then(r => r.json());
        const sub = subtasks.find(s => s.id === subtaskId);
        if (!sub) return;

        await fetch(`/api/subtarefas/detalhes/${subtaskId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                titulo: sub.titulo,
                concluida: sub.concluida,
                colaborador_id: collaboratorId ? parseInt(collaboratorId) : null
            })
        });
        
        await loadAndRenderSubtasks(taskId);
    } catch (err) {
        console.error('Error updating subtask collaborator:', err);
    }
};

// Add subtask inline button action
document.getElementById('btn-add-subtask-action').addEventListener('click', async () => {
    const taskId = parseInt(document.getElementById('edit-task-id').value);
    const titleInput = document.getElementById('new-subtask-title');
    const title = titleInput.value.trim();
    if (!title) return;

    const assigneeSelect = document.getElementById('new-subtask-assignee');
    const collaborator_id = assigneeSelect && assigneeSelect.value ? parseInt(assigneeSelect.value) : null;

    try {
        await fetch('/api/subtarefas', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                tarefa_id: taskId,
                titulo: title,
                concluida: false,
                colaborador_id
            })
        });

        titleInput.value = '';
        await loadAndRenderSubtasks(taskId);
    } catch (err) {
        console.error('Error adding subtask:', err);
    }
});

// Update main task status and hours from form submit
async function handleEditTaskStatusSubmit(e) {
    e.preventDefault();
    const id = document.getElementById('edit-task-id').value;
    const payload = {
        status: document.getElementById('edit-task-status-select').value,
        horas_trabalhadas: parseFloat(document.getElementById('edit-task-worked-hours').value)
    };

    try {
        await fetch(`/api/tarefas/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        closeModal(elements.modalEditTaskStatus);
        await loadBaseData();
        renderCurrentTab();
    } catch (err) {
        console.error('Error updating task details:', err);
    }
}

// Edit project form open helper
window.editProject = function(projectId) {
    const proj = state.projetos.find(p => p.id === projectId);
    if (!proj) return;

    document.getElementById('project-modal-title').textContent = "Editar Projeto";
    document.getElementById('project-id').value = proj.id;
    document.getElementById('project-name').value = proj.nome;
    document.getElementById('project-desc').value = proj.descricao || '';
    
    // Format dates to YYYY-MM-DD
    const start = new Date(proj.data_inicio).toISOString().split('T')[0];
    document.getElementById('project-start').value = start;
    if (proj.data_fim) {
        const end = new Date(proj.data_fim).toISOString().split('T')[0];
        document.getElementById('project-end').value = end;
    } else {
        document.getElementById('project-end').value = '';
    }

    document.getElementById('project-coordination').value = proj.coordenadoria_id || '';
    document.getElementById('project-status').value = proj.status;

    openModal(elements.modalProject);
};

// Delete project helper
window.deleteProject = async function(projectId) {
    const proj = state.projetos.find(p => p.id === projectId);
    if (!proj) return;
    
    if (confirm(`Deseja realmente excluir o projeto "${proj.nome}"?\nTodas as tarefas e sub-tarefas associadas a ele também serão excluídas permanentemente.`)) {
        try {
            const res = await fetch(`/api/projetos/${projectId}`, {
                method: 'DELETE'
            }).then(r => r.json());
            
            if (res.error) {
                alert('Erro ao excluir projeto: ' + res.error);
            } else {
                await loadBaseData();
                renderCurrentTab();
            }
        } catch (err) {
            console.error('Error deleting project:', err);
            alert('Erro de conexão ao tentar excluir o projeto.');
        }
    }
};

// Open empty project modal helper (reset edit title)
document.getElementById('btn-add-project').addEventListener('click', () => {
    document.getElementById('project-modal-title').textContent = "Novo Projeto";
    document.getElementById('project-id').value = '';
});

// Status Helpers
function getStatusClass(status) {
    switch (status) {
        case 'Planejado': return 'badge-todo';
        case 'Em Andamento': return 'badge-progress';
        case 'Concluído': return 'badge-done';
        case 'Pendente': return 'badge-pending';
        default: return 'badge-todo';
    }
}

// Edit coordination helper
window.editCoordination = function(coordId) {
    const coord = state.coordenadorias.find(c => c.id === coordId);
    if (!coord) return;

    document.getElementById('coord-modal-title').textContent = "Editar Coordenadoria";
    document.getElementById('coord-id').value = coord.id;
    document.getElementById('coord-sigla').value = coord.sigla;
    document.getElementById('coord-name').value = coord.nome;
    document.getElementById('coord-gerencia').value = coord.gerencia_id || '';

    openModal(elements.modalCoordination);
};

// Delete coordination helper
window.deleteCoordination = async function(coordId) {
    const coord = state.coordenadorias.find(c => c.id === coordId);
    if (!coord) return;

    if (confirm(`Deseja realmente excluir a coordenadoria "${coord.sigla} - ${coord.nome}"?\nNota: Colaboradores e projetos vinculados a ela ficarão sem setor.`)) {
        try {
            const res = await fetch(`/api/coordenadorias/${coordId}`, {
                method: 'DELETE'
            }).then(r => r.json());

            if (res.error) {
                alert('Erro ao excluir coordenadoria: ' + res.error);
            } else {
                await loadBaseData();
                renderCurrentTab();
            }
        } catch (err) {
            console.error('Error deleting coordination:', err);
            alert('Erro de conexão ao tentar excluir a coordenadoria.');
        }
    }
};

// Edit management helper
window.editManagement = function(mgmtId) {
    const mgmt = state.gerencias.find(g => g.id === mgmtId);
    if (!mgmt) return;

    document.getElementById('mgmt-modal-title').textContent = "Editar Gerência";
    document.getElementById('mgmt-id').value = mgmt.id;
    document.getElementById('mgmt-sigla').value = mgmt.sigla;
    document.getElementById('mgmt-name').value = mgmt.nome;

    openModal(elements.modalManagement);
};

// Delete management helper
window.deleteManagement = async function(mgmtId) {
    const mgmt = state.gerencias.find(g => g.id === mgmtId);
    if (!mgmt) return;

    if (confirm(`Deseja realmente excluir a gerência "${mgmt.sigla} - ${mgmt.nome}"?\nNota: Coordenadorias vinculadas a ela ficarão sem gerência.`)) {
        try {
            const res = await fetch(`/api/gerencias/${mgmtId}`, {
                method: 'DELETE'
            }).then(r => r.json());

            if (res.error) {
                alert('Erro ao excluir gerência: ' + res.error);
            } else {
                await loadBaseData();
                renderCurrentTab();
            }
        } catch (err) {
            console.error('Error deleting management:', err);
            alert('Erro de conexão ao tentar excluir a gerência.');
        }
    }
};

// Edit collaborator helper
window.editCollaborator = function(colabId) {
    const colab = state.colaboradores.find(c => c.id === colabId);
    if (!colab) return;

    document.getElementById('colab-modal-title').textContent = "Editar Colaborador";
    document.getElementById('colab-id').value = colab.id;
    document.getElementById('colab-name').value = colab.nome;
    document.getElementById('colab-email').value = colab.email;
    document.getElementById('colab-role').value = colab.cargo;
    document.getElementById('colab-coordination').value = colab.coordenadoria_id || '';

    openModal(elements.modalCollaborator);
};

// Delete collaborator helper
window.deleteCollaborator = async function(colabId) {
    const colab = state.colaboradores.find(c => c.id === colabId);
    if (!colab) return;

    if (confirm(`Deseja realmente excluir o colaborador "${colab.nome}"?\nNota: Ele será desvinculado de todas as tarefas e sub-tarefas associadas.`)) {
        try {
            const res = await fetch(`/api/colaboradores/${colabId}`, {
                method: 'DELETE'
            }).then(r => r.json());

            if (res.error) {
                alert('Erro ao excluir colaborador: ' + res.error);
            } else {
                await loadBaseData();
                renderCurrentTab();
            }
        } catch (err) {
            console.error('Error deleting collaborator:', err);
            alert('Erro de conexão ao tentar excluir o colaborador.');
        }
    }
};

// Task Details Edit/Delete Helper functions
async function handleDeleteTaskAction() {
    const taskId = document.getElementById('edit-task-id').value;
    if (!taskId) return;

    if (confirm('Deseja realmente excluir esta tarefa? Todas as sub-tarefas associadas também serão excluídas permanentemente.')) {
        try {
            await fetch(`/api/tarefas/${taskId}`, {
                method: 'DELETE'
            });
            closeModal(elements.modalEditTaskStatus);
            await loadBaseData();
            renderCurrentTab();
        } catch (err) {
            console.error('Error deleting task:', err);
            alert('Erro ao tentar excluir a tarefa.');
        }
    }
}

function handleEditTaskDetailsAction() {
    const taskId = parseInt(document.getElementById('edit-task-id').value);
    if (!taskId) return;

    const task = state.tarefas.find(t => t.id === taskId);
    if (!task) return;

    // Load fields into form-task
    document.getElementById('task-modal-title').textContent = "Editar Tarefa";
    document.getElementById('task-id').value = task.id;
    document.getElementById('task-project').value = task.projeto_id;
    document.getElementById('task-priority').value = task.prioridade;
    document.getElementById('task-title').value = task.titulo;
    document.getElementById('task-desc').value = task.descricao || '';
    document.getElementById('task-assignee').value = task.colaborador_id || '';
    
    // Format delivery date (YYYY-MM-DD)
    if (task.data_entrega) {
        const dateStr = new Date(task.data_entrega).toISOString().split('T')[0];
        document.getElementById('task-deadline').value = dateStr;
    } else {
        document.getElementById('task-deadline').value = '';
    }
    
    document.getElementById('task-est-hours').value = task.horas_estimadas;
    document.getElementById('task-worked-hours').value = task.horas_trabalhadas;

    // Close status modal and open full edit modal
    closeModal(elements.modalEditTaskStatus);
    openModal(elements.modalTask);
}

// Subtask Edit/Delete Helper functions
window.editSubtask = async function(subtaskId) {
    const subtasks = await fetch(`/api/subtarefas/${document.getElementById('edit-task-id').value}`).then(r => r.json());
    const sub = subtasks.find(s => s.id === subtaskId);
    if (!sub) return;

    const newTitle = prompt("Digite o novo título para a sub-tarefa:", sub.titulo);
    if (newTitle === null) return; // user cancelled
    const titleVal = newTitle.trim();
    if (!titleVal) return;

    try {
        await fetch(`/api/subtarefas/detalhes/${subtaskId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                titulo: titleVal,
                concluida: sub.concluida,
                colaborador_id: sub.colaborador_id
            })
        });
        
        const taskId = parseInt(document.getElementById('edit-task-id').value);
        await loadAndRenderSubtasks(taskId);
    } catch (err) {
        console.error('Error editing subtask:', err);
    }
};

window.deleteSubtask = async function(subtaskId) {
    if (confirm("Deseja realmente excluir esta sub-tarefa?")) {
        try {
            await fetch(`/api/subtarefas/${subtaskId}`, {
                method: 'DELETE'
            });
            const taskId = parseInt(document.getElementById('edit-task-id').value);
            await loadAndRenderSubtasks(taskId);
        } catch (err) {
            console.error('Error deleting subtask:', err);
        }
    }
};


