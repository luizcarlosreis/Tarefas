let state = {
    coordenadorias: [],
    colaboradores: [],
    projetos: [],
    tarefas: [],
    gerencias: [],
    apontamentos: [],
    mesesFechamento: [],
    solicitantes: [],
    perfis: [],
    funcionalidades: [],
    empresas: [],
    selectedEmpresaId: null,
    terceirizados: [],
    currentUser: null,
    currentTab: 'dashboard-tab',
    currentReport: null
};

let currentProfileLinkedColabs = [];

function getCoordinatorName(coordenadoriaId) {
    if (!state.coordenadorias || !coordenadoriaId) return '';
    const coord = state.coordenadorias.find(c => c.id == coordenadoriaId);
    return coord ? (coord.coordenador_nome || '') : '';
}

// --- DOM ELEMENTS ---
const elements = {
    tabs: document.querySelectorAll('.tab-content'),
    menuItems: document.querySelectorAll('.menu-item[data-tab]'),
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
    requestersList: document.getElementById('requesters-list'),
    profilesList: document.getElementById('profiles-list'),
    apontamentosList: document.getElementById('apontamentos-list'),
    
    // Filters & Search
    projectSearch: document.getElementById('project-search'),
    taskGerenciaFilter: document.getElementById('task-gerencia-filter'),
    taskCoordenadoriaFilter: document.getElementById('task-coordenadoria-filter'),
    taskProjectFilter: document.getElementById('task-project-filter'),
    reportFechamento: document.getElementById('report-fechamento'),
    apontamentoSearch: document.getElementById('apontamento-search'),
    apontamentoPeriodFilter: document.getElementById('apontamento-period-filter'),
    
    // Modals
    modalProject: document.getElementById('modal-project'),
    modalTask: document.getElementById('modal-task'),
    modalCollaborator: document.getElementById('modal-collaborator'),
    modalCoordination: document.getElementById('modal-coordination'),
    modalManagement: document.getElementById('modal-management'),
    modalRequester: document.getElementById('modal-requester'),
    modalProfile: document.getElementById('modal-profile'),
    modalEditTaskStatus: document.getElementById('modal-edit-task-status'),
    modalApontamento: document.getElementById('modal-apontamento'),
    modalManageFechamentos: document.getElementById('modal-manage-fechamentos'),
    
    // Forms
    formProject: document.getElementById('form-project'),
    formTask: document.getElementById('form-task'),
    formCollaborator: document.getElementById('form-collaborator'),
    formCoordination: document.getElementById('form-coordination'),
    formManagement: document.getElementById('form-management'),
    formRequester: document.getElementById('form-requester'),
    formProfile: document.getElementById('form-profile'),
    formEditTaskStatus: document.getElementById('form-edit-task-status'),
    formApontamento: document.getElementById('form-apontamento'),
    formFechamento: document.getElementById('form-fechamento'),
    
    // Custom list tables
    fechamentosListTable: document.getElementById('fechamentos-list-table')
};

// --- INITIALIZATION ---
document.addEventListener('DOMContentLoaded', () => {
    initApp();
    setupEventListeners();
});

async function loadVersion() {
    try {
        const res = await fetch('/api/version');
        const data = await res.json();
        const displays = document.querySelectorAll('.system-version-display');
        displays.forEach(el => {
            if (el.classList.contains('login-version')) {
                el.textContent = `Controle de Tarefas • ${data.version}`;
            } else {
                el.innerHTML = `<i class="fa-solid fa-code-branch"></i> ${data.version}`;
            }
        });
    } catch (err) {
        console.error('Error loading version:', err);
    }
}

async function initApp() {
    loadVersion();
    // Check for stored user session
    const storedUser = localStorage.getItem('currentUser');
    if (storedUser) {
        try {
            state.currentUser = JSON.parse(storedUser);
        } catch (e) {
            localStorage.removeItem('currentUser');
        }
    }
    
    if (!state.currentUser) {
        showLoginScreen();
        return;
    }
    
    // Fetch initial backend data
    await loadBaseData();
    
    // Select the active period by default if available
    if (state.mesesFechamento && state.mesesFechamento.length > 0) {
        const activePeriod = state.mesesFechamento.find(f => f.ativo);
        elements.reportFechamento.value = activePeriod ? activePeriod.id : state.mesesFechamento[0].id;
    }
    
    updateLoggedInUserUI();
    applySecurityPermissions();
    
    // Choose initial tab: Apontador profile defaults to pointing screen (apontamentos-tab)
    const profiles = state.currentUser ? (state.currentUser.profiles || []) : [];
    const isApontador = profiles.includes('Apontador');
    const isHigher = profiles.includes('Administrador') || profiles.includes('Gerência') || profiles.includes('Coordenador');
    
    let initialTab = 'dashboard-tab';
    if (isApontador && !isHigher) {
        initialTab = 'apontamentos-tab';
    } else {
        const allowed = state.currentUser ? (state.currentUser.functionalities || []) : [];
        if (!allowed.includes('painel-geral')) {
            if (allowed.includes('apontamentos')) {
                initialTab = 'apontamentos-tab';
            } else if (allowed.includes('tarefas')) {
                initialTab = 'tasks-tab';
            } else {
                const tabPermissions = {
                    'projects-tab': 'projetos',
                    'tasks-tab': 'tarefas',
                    'team-tab': 'equipes',
                    'requesters-tab': 'solicitantes',
                    'profiles-tab': 'perfis',
                    'functionalities-tab': 'funcionalidades',
                    'closing-tab': 'fechamento-mensal',
                    'apontamentos-tab': 'apontamentos',
                    'partners-tab': 'empresas'
                };
                for (const [tId, perm] of Object.entries(tabPermissions)) {
                    if (allowed.includes(perm)) {
                        initialTab = tId;
                        break;
                    }
                }
            }
        }
    }
    
    switchTab(initialTab);
}

async function loadBaseData() {
    try {
        const [resCoord, resColab, resProj, resTasks, resGerencias, resApont, resFechamentos, resSolicitantes, resPerfis, resFuncionalidades, resEmpresas, resTerceirizados] = await Promise.all([
            fetch('/api/coordenadorias').then(r => r.json()),
            fetch('/api/colaboradores').then(r => r.json()),
            fetch('/api/projetos').then(r => r.json()),
            fetch('/api/tarefas').then(r => r.json()),
            fetch('/api/gerencias').then(r => r.json()),
            fetch('/api/apontamentos').then(r => r.json()),
            fetch('/api/meses-fechamento').then(r => r.json()),
            fetch('/api/solicitantes').then(r => r.json()),
            fetch('/api/perfis').then(r => r.json()),
            fetch('/api/funcionalidades').then(r => r.json()),
            fetch('/api/empresas').then(r => r.json()),
            fetch('/api/terceirizados').then(r => r.json())
        ]);

        state.coordenadorias = resCoord;
        state.colaboradores = resColab;
        state.projetos = resProj;
        state.tarefas = resTasks;
        state.gerencias = resGerencias;
        state.apontamentos = resApont;
        state.mesesFechamento = resFechamentos;
        state.solicitantes = resSolicitantes;
        state.perfis = resPerfis;
        state.funcionalidades = resFuncionalidades;
        state.empresas = resEmpresas;
        state.terceirizados = resTerceirizados;

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

    // Sub-tab Navigation (Teams Screen)
    const subTabBtns = document.querySelectorAll('.sub-tab-btn');
    subTabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const subtabId = btn.getAttribute('data-subtab');
            
            // Remove active class from all sub-tab buttons and content areas
            subTabBtns.forEach(b => b.classList.remove('active'));
            document.querySelectorAll('.sub-tab-content').forEach(c => c.classList.remove('active'));
            
            // Add active class to clicked button and target content area
            btn.classList.add('active');
            const targetContent = document.getElementById(subtabId);
            if (targetContent) targetContent.classList.add('active');
        });
    });

    document.getElementById('btn-add-project').addEventListener('click', () => {
        document.getElementById('project-modal-title').textContent = "Registrar Novo Projeto";
        document.getElementById('project-id').value = '';
        const form = elements.formProject;
        if (form) {
            form.reset();
            const projGerenciaSelect = document.getElementById('project-gerencia');
            if (projGerenciaSelect) {
                projGerenciaSelect.value = '';
            }
            updateProjectCoordinationDropdown('');
        }
        openModal(elements.modalProject);
    });
    document.getElementById('btn-dashboard-add-project').addEventListener('click', () => {
        document.getElementById('project-modal-title').textContent = "Registrar Novo Projeto";
        document.getElementById('project-id').value = '';
        const form = elements.formProject;
        if (form) {
            form.reset();
            const projGerenciaSelect = document.getElementById('project-gerencia');
            if (projGerenciaSelect) {
                projGerenciaSelect.value = '';
            }
            updateProjectCoordinationDropdown('');
        }
        openModal(elements.modalProject);
    });
    document.getElementById('btn-add-task').addEventListener('click', () => {
        document.getElementById('task-modal-title').textContent = "Criar Nova Tarefa";
        document.getElementById('task-id').value = '';
        const form = elements.formTask;
        if (form) form.reset();
        updateTaskCoordinatorDisplay('');
        openModal(elements.modalTask);
    });
    document.getElementById('btn-add-collaborator').addEventListener('click', () => {
        document.getElementById('colab-modal-title').textContent = "Adicionar Novo Colaborador";
        document.getElementById('colab-id').value = '';
        
        const form = elements.formCollaborator;
        if (form) {
            form.reset();
            const colabGerenciaSelect = document.getElementById('colab-gerencia');
            if (colabGerenciaSelect) {
                colabGerenciaSelect.value = '';
                updateColabCoordinationDropdown('');
            }
        }
        
        openModal(elements.modalCollaborator);
    });
    document.getElementById('btn-add-coordination').addEventListener('click', () => {
        document.getElementById('coord-modal-title').textContent = "Registrar Coordenadoria";
        document.getElementById('coord-id').value = '';
        const form = document.getElementById('form-coordination');
        if (form) form.reset();
        openModal(elements.modalCoordination);
    });
    document.getElementById('btn-add-management').addEventListener('click', () => {
        document.getElementById('mgmt-modal-title').textContent = "Registrar Gerência";
        document.getElementById('mgmt-id').value = '';
        const form = document.getElementById('form-management');
        if (form) form.reset();
        openModal(elements.modalManagement);
    });
    document.getElementById('btn-add-requester').addEventListener('click', () => {
        document.getElementById('requester-modal-title').textContent = "Registrar Solicitante";
        document.getElementById('requester-id').value = '';
        openModal(elements.modalRequester);
    });
    document.getElementById('btn-add-profile').addEventListener('click', () => {
        document.getElementById('profile-modal-title').textContent = "Registrar Perfil";
        document.getElementById('profile-id').value = '';
        document.getElementById('profile-name').value = '';
        currentProfileLinkedColabs = [];
        document.getElementById('profile-colab-cpf').value = '';
        populateProfileColabDropdown();
        renderProfileLinkedColabs();
        populateProfileFunctionalitiesList([]);
        openModal(elements.modalProfile);
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

    document.getElementById('btn-close-requester-modal').addEventListener('click', () => closeModal(elements.modalRequester));
    document.getElementById('btn-cancel-requester').addEventListener('click', () => closeModal(elements.modalRequester));

    document.getElementById('btn-close-profile-modal').addEventListener('click', () => closeModal(elements.modalProfile));
    document.getElementById('btn-cancel-profile').addEventListener('click', () => closeModal(elements.modalProfile));

    document.getElementById('btn-profile-add-colab').addEventListener('click', () => {
        const cpfInput = document.getElementById('profile-colab-cpf').value.trim();
        const selectEl = document.getElementById('profile-colab-select');
        let selectedColab = null;

        if (cpfInput) {
            // Find by CPF (ignoring non-digits)
            selectedColab = state.colaboradores.find(c => c.cpf && c.cpf.replace(/\D/g, '') === cpfInput.replace(/\D/g, ''));
            if (!selectedColab) {
                alert('Colaborador com este CPF não foi encontrado.');
                return;
            }
        } else if (selectEl.value) {
            // Find by combo
            const colabId = parseInt(selectEl.value);
            selectedColab = state.colaboradores.find(c => c.id === colabId);
        }

        if (selectedColab) {
            if (currentProfileLinkedColabs.includes(selectedColab.id)) {
                alert('Este colaborador já está vinculado a este perfil.');
            } else {
                currentProfileLinkedColabs.push(selectedColab.id);
                document.getElementById('profile-colab-cpf').value = '';
                selectEl.value = '';
                renderProfileLinkedColabs();
            }
        } else {
            alert('Por favor, selecione um colaborador ou digite o CPF.');
        }
    });

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
    elements.formRequester.addEventListener('submit', handleRequesterSubmit);
    elements.formProfile.addEventListener('submit', handleProfileSubmit);
    elements.formEditTaskStatus.addEventListener('submit', handleEditTaskStatusSubmit);
    elements.formApontamento.addEventListener('submit', handleApontamentoSubmit);

    // Auth & Logout listeners
    const formLogin = document.getElementById('form-login');
    if (formLogin) {
        formLogin.addEventListener('submit', handleLoginSubmit);
    }
    const btnLogout = document.getElementById('btn-logout');
    if (btnLogout) {
        btnLogout.addEventListener('click', window.handleLogout);
    }

    // Functionality Modal listeners
    const btnAddFunc = document.getElementById('btn-add-functionality');
    if (btnAddFunc) {
        btnAddFunc.addEventListener('click', () => {
            document.getElementById('functionality-modal-title').textContent = "Registrar Funcionalidade";
            document.getElementById('functionality-id').value = '';
            document.getElementById('functionality-key').value = '';
            document.getElementById('functionality-key').disabled = false;
            document.getElementById('functionality-name').value = '';
            openModal(document.getElementById('modal-functionality'));
        });
    }
    const btnCloseFunc = document.getElementById('btn-close-functionality-modal');
    if (btnCloseFunc) {
        btnCloseFunc.addEventListener('click', () => closeModal(document.getElementById('modal-functionality')));
    }
    const btnCancelFunc = document.getElementById('btn-cancel-functionality');
    if (btnCancelFunc) {
        btnCancelFunc.addEventListener('click', () => closeModal(document.getElementById('modal-functionality')));
    }
    const formFunc = document.getElementById('form-functionality');
    if (formFunc) {
        formFunc.addEventListener('submit', handleFunctionalitySubmit);
    }



    // Filters and Search
    elements.projectSearch.addEventListener('input', renderProjectsTab);
    if (elements.taskGerenciaFilter) {
        elements.taskGerenciaFilter.addEventListener('change', () => {
            updateTaskBoardFilters(true, true);
            renderTasksTab();
        });
    }
    if (elements.taskCoordenadoriaFilter) {
        elements.taskCoordenadoriaFilter.addEventListener('change', () => {
            updateTaskBoardFilters(false, true);
            renderTasksTab();
        });
    }
    elements.taskProjectFilter.addEventListener('change', renderTasksTab);
    elements.apontamentoSearch.addEventListener('input', renderApontamentosTab);
    if (elements.apontamentoPeriodFilter) {
        elements.apontamentoPeriodFilter.addEventListener('change', renderApontamentosTab);
    }
    if (elements.reportFechamento) {
        elements.reportFechamento.addEventListener('change', generateMonthlyReport);
    }
    
    const btnPrintColabs = document.getElementById('btn-print-collaborators-report');
    if (btnPrintColabs) {
        btnPrintColabs.addEventListener('click', generateAllCollaboratorsPDF);
    }

    const reportGerenciaFilter = document.getElementById('report-gerencia-filter');
    if (reportGerenciaFilter) {
        reportGerenciaFilter.addEventListener('change', (e) => {
            updateReportCoordinationDropdown(e.target.value);
            renderReportTables();
        });
    }
    const reportCoordenadoriaFilter = document.getElementById('report-coordenadoria-filter');
    if (reportCoordenadoriaFilter) {
        reportCoordenadoriaFilter.addEventListener('change', () => {
            renderReportTables();
        });
    }
    
    // Closing periods management triggers
    const btnManageFechamentos = document.getElementById('btn-manage-fechamentos');
    if (btnManageFechamentos) {
        btnManageFechamentos.addEventListener('click', openManageFechamentosModal);
    }
    document.getElementById('nav-manage-periods').addEventListener('click', (e) => {
        e.preventDefault();
        openManageFechamentosModal();
    });
    document.getElementById('btn-close-manage-fechamentos-modal').addEventListener('click', () => closeModal(elements.modalManageFechamentos));
    document.getElementById('btn-close-manage-fechamentos').addEventListener('click', () => closeModal(elements.modalManageFechamentos));
    elements.formFechamento.addEventListener('submit', handleFechamentoSubmit);

    // Global Escape key down listener to close active modals
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            const activeModal = document.querySelector('.modal-backdrop.active');
            if (activeModal) {
                closeModal(activeModal);
            }
        }
    });

    // Profile Functionalities list usability listeners
    const profileFuncSearch = document.getElementById('profile-func-search');
    if (profileFuncSearch) {
        profileFuncSearch.addEventListener('input', (e) => {
            const query = e.target.value.toLowerCase().trim();
            const items = document.querySelectorAll('#profile-functionalities-list .func-item');
            items.forEach(item => {
                const key = item.getAttribute('data-chave') || '';
                const name = item.getAttribute('data-nome') || '';
                if (key.includes(query) || name.includes(query)) {
                    item.style.setProperty('display', 'flex', 'important');
                } else {
                    item.style.setProperty('display', 'none', 'important');
                }
            });
        });
    }

    const btnProfileFuncSelectAll = document.getElementById('btn-profile-func-select-all');
    if (btnProfileFuncSelectAll) {
        btnProfileFuncSelectAll.addEventListener('click', () => {
            const items = document.querySelectorAll('#profile-functionalities-list .func-item');
            items.forEach(item => {
                if (item.style.display !== 'none') {
                    const cb = item.querySelector('input[type="checkbox"]');
                    if (cb) cb.checked = true;
                }
            });
        });
    }

    const btnProfileFuncClearAll = document.getElementById('btn-profile-func-clear-all');
    if (btnProfileFuncClearAll) {
        btnProfileFuncClearAll.addEventListener('click', () => {
            const items = document.querySelectorAll('#profile-functionalities-list .func-item');
            items.forEach(item => {
                if (item.style.display !== 'none') {
                    const cb = item.querySelector('input[type="checkbox"]');
                    if (cb) cb.checked = false;
                }
            });
        });
    }

    setupDatePickerListeners();

    // Apontamento Modal triggers
    document.getElementById('btn-add-apontamento').addEventListener('click', () => {
        document.getElementById('apontamento-modal-title').textContent = "Registrar Apontamento";
        document.getElementById('apontamento-date').value = new Date().toISOString().split('T')[0];
        document.getElementById('apontamento-id').value = '';
        
        // Lock to current logged in user
        const colabSelect = document.getElementById('apontamento-collaborator');
        if (colabSelect && state.currentUser) {
            colabSelect.value = state.currentUser.id;
            colabSelect.disabled = true;
        }
        
        document.getElementById('apontamento-project').value = '';
        document.getElementById('apontamento-hours').value = '';
        document.getElementById('apontamento-desc').value = '';
        
        const projectSelect = document.getElementById('apontamento-project');
        projectSelect.innerHTML = '<option value="" disabled selected>Selecione um colaborador primeiro...</option>';
        projectSelect.disabled = true;

        const taskSelect = document.getElementById('apontamento-task');
        taskSelect.innerHTML = '<option value="" disabled selected>Selecione um projeto primeiro...</option>';
        taskSelect.disabled = true;
        
        const subtaskSelect = document.getElementById('apontamento-subtask');
        subtaskSelect.innerHTML = '<option value="">Nenhuma (Opcional)</option>';
        subtaskSelect.disabled = true;
        
        // Trigger collaborator change to load projects for current user
        if (colabSelect) {
            colabSelect.dispatchEvent(new Event('change'));
        }
        
        openModal(elements.modalApontamento);
    });

    document.getElementById('btn-close-apontamento-modal').addEventListener('click', () => closeModal(elements.modalApontamento));
    document.getElementById('btn-cancel-apontamento').addEventListener('click', () => closeModal(elements.modalApontamento));

    // Colaborador Gerência change listener to update Coordination options
    const colabGerenciaSelect = document.getElementById('colab-gerencia');
    if (colabGerenciaSelect) {
        colabGerenciaSelect.addEventListener('change', (e) => {
            updateColabCoordinationDropdown(e.target.value);
        });
    }

    // Filter projects based on selected collaborator's actual tasks or sub-tasks assignments
    document.getElementById('apontamento-collaborator').addEventListener('change', (e) => {
        const colabId = e.target.value;
        const projectSelect = document.getElementById('apontamento-project');
        const taskSelect = document.getElementById('apontamento-task');
        const subtaskSelect = document.getElementById('apontamento-subtask');
        
        // Reset subsequent selects
        projectSelect.innerHTML = '<option value="" disabled selected>Escolha o projeto...</option>';
        projectSelect.disabled = true;
        taskSelect.innerHTML = '<option value="" disabled selected>Selecione um projeto primeiro...</option>';
        taskSelect.disabled = true;
        subtaskSelect.innerHTML = '<option value="">Nenhuma (Opcional)</option>';
        subtaskSelect.disabled = true;

        if (!colabId) return;

        const colabIdInt = parseInt(colabId);
        
        // Compile unique list of project IDs where this collaborator is assigned to a task or a subtask
        const associatedProjectIds = new Set();
        state.tarefas.forEach(t => {
            // Task assigned directly
            if (t.colaborador_id === colabIdInt) {
                associatedProjectIds.add(t.projeto_id);
            }
            // Or subtask assigned
            if (t.subtasks && Array.isArray(t.subtasks)) {
                t.subtasks.forEach(s => {
                    if (s.colaborador_id === colabIdInt) {
                        associatedProjectIds.add(t.projeto_id);
                    }
                });
            }
        });

        const colabProjects = state.projetos.filter(p => associatedProjectIds.has(p.id));
        
        if (colabProjects.length === 0) {
            projectSelect.innerHTML = '<option value="" disabled selected>Nenhum projeto vinculado a este colaborador por tarefas</option>';
            return;
        }

        if (colabProjects.length === 1) {
            const p = colabProjects[0];
            projectSelect.innerHTML = `<option value="${p.id}" selected>${p.nome}</option>`;
            projectSelect.disabled = false;
            projectSelect.dispatchEvent(new Event('change'));
        } else {
            let html = '<option value="" disabled selected>Escolha o projeto...</option>';
            colabProjects.forEach(p => {
                html += `<option value="${p.id}">${p.nome}</option>`;
            });
            projectSelect.innerHTML = html;
            projectSelect.disabled = false;
        }
    });

    // Apontamento Dropdowns cascaded filtering based on collaborator task assignments
    document.getElementById('apontamento-project').addEventListener('change', (e) => {
        const projectId = e.target.value;
        const taskSelect = document.getElementById('apontamento-task');
        const subtaskSelect = document.getElementById('apontamento-subtask');
        
        // Reset subtask
        subtaskSelect.innerHTML = '<option value="">Nenhuma (Opcional)</option>';
        subtaskSelect.disabled = true;
        
        if (!projectId) {
            taskSelect.innerHTML = '<option value="" disabled selected>Selecione um projeto primeiro...</option>';
            taskSelect.disabled = true;
            return;
        }

        const colabId = document.getElementById('apontamento-collaborator').value;
        if (!colabId) return;
        const colabIdInt = parseInt(colabId);
        
        // Filter tasks of this project where this collaborator is assigned (directly or via a subtask)
        const projectTasks = state.tarefas.filter(t => 
            t.projeto_id == projectId && 
            (t.colaborador_id === colabIdInt || (t.subtasks && t.subtasks.some(s => s.colaborador_id === colabIdInt)))
        );

        if (projectTasks.length === 0) {
            taskSelect.innerHTML = '<option value="" disabled selected>Nenhuma tarefa vinculada para você neste projeto</option>';
            taskSelect.disabled = true;
            return;
        }

        if (projectTasks.length === 1) {
            const t = projectTasks[0];
            taskSelect.innerHTML = `<option value="${t.id}" selected>${t.titulo}</option>`;
            taskSelect.disabled = false;
            // Dispatch change event to load subtasks
            taskSelect.dispatchEvent(new Event('change'));
        } else {
            let html = '<option value="" disabled selected>Escolha uma tarefa...</option>';
            projectTasks.forEach(t => {
                html += `<option value="${t.id}">${t.titulo}</option>`;
            });
            taskSelect.innerHTML = html;
            taskSelect.disabled = false;
        }
    });

    document.getElementById('apontamento-task').addEventListener('change', (e) => {
        const taskId = e.target.value;
        const subtaskSelect = document.getElementById('apontamento-subtask');
        
        if (!taskId) {
            subtaskSelect.innerHTML = '<option value="">Nenhuma (Opcional)</option>';
            subtaskSelect.disabled = true;
            return;
        }

        const colabId = document.getElementById('apontamento-collaborator').value;
        if (!colabId) return;
        const colabIdInt = parseInt(colabId);
        
        // Filter subtasks where this collaborator is assigned, or show all if they own the parent task
        const task = state.tarefas.find(t => t.id == taskId);
        if (task && task.subtasks && task.subtasks.length > 0) {
            const filteredSubtasks = task.subtasks.filter(s => 
                s.colaborador_id === colabIdInt || task.colaborador_id === colabIdInt
            );

            if (filteredSubtasks.length === 1) {
                const s = filteredSubtasks[0];
                subtaskSelect.innerHTML = `
                    <option value="">Nenhuma (Opcional)</option>
                    <option value="${s.id}" selected>${s.titulo}</option>
                `;
                subtaskSelect.disabled = false;
            } else if (filteredSubtasks.length > 1) {
                let html = '<option value="">Nenhuma (Opcional)</option>';
                filteredSubtasks.forEach(s => {
                    html += `<option value="${s.id}">${s.titulo}</option>`;
                });
                subtaskSelect.innerHTML = html;
                subtaskSelect.disabled = false;
            } else {
                subtaskSelect.innerHTML = '<option value="">Nenhuma sub-tarefa disponível para você</option>';
                subtaskSelect.disabled = true;
            }
        } else {
            subtaskSelect.innerHTML = '<option value="">Nenhuma sub-tarefa disponível</option>';
            subtaskSelect.disabled = true;
        }
    });

    // Update project coordination options when gerencia changes
    const projectGerenciaSelect = document.getElementById('project-gerencia');
    if (projectGerenciaSelect) {
        projectGerenciaSelect.addEventListener('change', (e) => {
            updateProjectCoordinationDropdown(e.target.value);
        });
    }

    // Update project coordinator display when coordination changes
    const projectCoordSelect = document.getElementById('project-coordination');
    if (projectCoordSelect) {
        projectCoordSelect.addEventListener('change', (e) => {
            updateProjectCoordinatorDisplay(e.target.value);
        });
    }

    // Update task coordinator display when assignee changes
    const taskAssigneeSelect = document.getElementById('task-assignee');
    if (taskAssigneeSelect) {
        taskAssigneeSelect.addEventListener('change', (e) => {
            updateTaskCoordinatorDisplay(e.target.value);
        });
    }

    // --- PARTNERS TAB EVENT LISTENERS ---

    const btnAddPartner = document.getElementById('btn-add-partner');
    if (btnAddPartner) btnAddPartner.addEventListener('click', () => openPartnerModal());

    const btnEditPartner = document.getElementById('btn-edit-partner');
    if (btnEditPartner) btnEditPartner.addEventListener('click', () => {
        const company = state.empresas.find(e => e.id == state.selectedEmpresaId);
        if (company) openPartnerModal(company);
    });

    const btnDeletePartner = document.getElementById('btn-delete-partner');
    if (btnDeletePartner) btnDeletePartner.addEventListener('click', deletePartner);

    const btnCancelPartner = document.getElementById('btn-cancel-partner');
    if (btnCancelPartner) btnCancelPartner.addEventListener('click', () => closeModal(document.getElementById('modal-partner')));

    const btnClosePartnerModal = document.getElementById('btn-close-partner-modal');
    if (btnClosePartnerModal) btnClosePartnerModal.addEventListener('click', () => closeModal(document.getElementById('modal-partner')));

    const formPartner = document.getElementById('form-partner');
    if (formPartner) formPartner.addEventListener('submit', handleSavePartner);

    // Outsourced button and modal actions
    const btnAddTerceirizado = document.getElementById('btn-add-terceirizado');
    if (btnAddTerceirizado) btnAddTerceirizado.addEventListener('click', () => openOutsourcedModal());

    const btnCancelOutsourced = document.getElementById('btn-cancel-outsourced');
    if (btnCancelOutsourced) btnCancelOutsourced.addEventListener('click', () => closeModal(document.getElementById('modal-outsourced')));

    const btnCloseOutsourcedModal = document.getElementById('btn-close-outsourced-modal');
    if (btnCloseOutsourcedModal) btnCloseOutsourcedModal.addEventListener('click', () => closeModal(document.getElementById('modal-outsourced')));

    const formOutsourced = document.getElementById('form-outsourced');
    if (formOutsourced) formOutsourced.addEventListener('submit', handleSaveOutsourced);

    // Masks for inputs
    const inputPartnerCnpj = document.getElementById('partner-cnpj');
    if (inputPartnerCnpj) {
        inputPartnerCnpj.addEventListener('input', (e) => maskCNPJ(e.target));
    }

    const inputOutsourcedCpf = document.getElementById('outsourced-cpf');
    if (inputOutsourcedCpf) {
        inputOutsourcedCpf.addEventListener('input', (e) => maskCPF(e.target));
    }

    // Subtask colab type and company filters
    const subtaskColabTypeSelect = document.getElementById('new-subtask-colab-type');
    if (subtaskColabTypeSelect) {
        subtaskColabTypeSelect.addEventListener('change', () => updateNewSubtaskAssigneeOptions());
    }

    const subtaskCompanySelect = document.getElementById('new-subtask-company');
    if (subtaskCompanySelect) {
        subtaskCompanySelect.addEventListener('change', () => updateNewSubtaskAssigneeOptions());
    }
}

function switchTab(tabId) {
    const tabPermissions = {
        'projects-tab': 'projetos',
        'tasks-tab': 'tarefas',
        'team-tab': 'equipes',
        'requesters-tab': 'solicitantes',
        'profiles-tab': 'perfis',
        'functionalities-tab': 'funcionalidades',
        'closing-tab': 'fechamento-mensal',
        'apontamentos-tab': 'apontamentos',
        'partners-tab': 'empresas'
    };
    
    if (tabPermissions[tabId]) {
        const requiredPerm = tabPermissions[tabId];
        const allowed = state.currentUser ? (state.currentUser.functionalities || []) : [];
        if (!allowed || !allowed.includes(requiredPerm)) {
            tabId = 'dashboard-tab';
        }
    }

    if (tabId === 'dashboard-tab') {
        const allowed = state.currentUser ? (state.currentUser.functionalities || []) : [];
        if (!allowed.includes('painel-geral')) {
            if (allowed.includes('apontamentos')) {
                tabId = 'apontamentos-tab';
            } else if (allowed.includes('tarefas')) {
                tabId = 'tasks-tab';
            } else {
                for (const [tId, perm] of Object.entries(tabPermissions)) {
                    if (allowed.includes(perm)) {
                        tabId = tId;
                        break;
                    }
                }
            }
        }
    }

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
        case 'apontamentos-tab':
            elements.pageTitle.textContent = "Apontamentos";
            elements.pageSubtitle.textContent = "Apontamento diário de horas e registro de atividades";
            break;
        case 'requesters-tab':
            elements.pageTitle.textContent = "Cadastro de Solicitantes";
            elements.pageSubtitle.textContent = "Gerenciamento de solicitantes de tarefas";
            break;
        case 'profiles-tab':
            elements.pageTitle.textContent = "Perfis de Acesso";
            elements.pageSubtitle.textContent = "Gerenciamento de perfis de acesso ao sistema";
            break;
        case 'functionalities-tab':
            elements.pageTitle.textContent = "Funcionalidades";
            elements.pageSubtitle.textContent = "Cadastro e controle de chaves de permissão do sistema";
            break;
        case 'partners-tab':
            elements.pageTitle.textContent = "Empresas Parceiras";
            elements.pageSubtitle.textContent = "Cadastro de empresas parceiras e seus colaboradores terceirizados";
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
        case 'requesters-tab':
            renderRequestersTab();
            break;
        case 'profiles-tab':
            renderProfilesTab();
            break;
        case 'functionalities-tab':
            renderFunctionalitiesTab();
            break;
        case 'closing-tab':
            // Generate report automatically for current selected values
            generateMonthlyReport();
            break;
        case 'apontamentos-tab':
            renderApontamentosTab();
            break;
        case 'partners-tab':
            renderPartnersTab();
            break;
    }
}

// --- HELPER DYNAMIC OPTIONS ---
function updateProjectCoordinationDropdown(gerenciaId, selectedCoordId = '') {
    const projCoordSelect = document.getElementById('project-coordination');
    if (!projCoordSelect) return;

    if (!gerenciaId) {
        projCoordSelect.innerHTML = '<option value="">Escolha uma gerência primeiro...</option>';
        projCoordSelect.disabled = true;
        updateProjectCoordinatorDisplay('');
        return;
    }

    projCoordSelect.disabled = false;
    let html = '<option value="">Sem Coordenadoria</option>';
    const filteredCoords = state.coordenadorias.filter(c => c.gerencia_id == gerenciaId);
    filteredCoords.forEach(c => {
        const coordName = getCoordinatorName(c.id);
        const coordSuffix = coordName ? ` (Coord: ${coordName})` : '';
        html += `<option value="${c.id}">${c.sigla} - ${c.nome}${coordSuffix}</option>`;
    });
    projCoordSelect.innerHTML = html;
    if (filteredCoords.length === 1 && !selectedCoordId) {
        projCoordSelect.value = filteredCoords[0].id;
    } else {
        projCoordSelect.value = selectedCoordId || '';
    }
    
    // Update coordinator display based on selected coordination
    updateProjectCoordinatorDisplay(projCoordSelect.value);
}

function updateProjectCoordinatorDisplay(coordenadoriaId) {
    const displayEl = document.getElementById('project-coordinator-display');
    const nameEl = document.getElementById('project-coordinator-name');
    if (!displayEl || !nameEl) return;
    
    const coordinatorName = getCoordinatorName(coordenadoriaId);
    if (coordinatorName) {
        nameEl.textContent = coordinatorName;
        displayEl.style.display = 'block';
    } else {
        displayEl.style.display = 'none';
    }
}

function updateTaskCoordinatorDisplay(colabId) {
    const displayEl = document.getElementById('task-coordinator-display');
    const nameEl = document.getElementById('task-coordinator-name');
    if (!displayEl || !nameEl) return;

    if (!colabId) {
        displayEl.style.display = 'none';
        return;
    }

    const colab = state.colaboradores.find(c => c.id == colabId);
    if (colab && colab.coordenadoria_id) {
        const coordinatorName = getCoordinatorName(colab.coordenadoria_id);
        if (coordinatorName) {
            nameEl.textContent = coordinatorName;
            displayEl.style.display = 'block';
            return;
        }
    }
    displayEl.style.display = 'none';
}

function updateTaskBoardFilters(updateCoords = true, updateProjects = true) {
    const gerenciaVal = elements.taskGerenciaFilter ? elements.taskGerenciaFilter.value : 'all';
    const coordSelect = elements.taskCoordenadoriaFilter;
    const projSelect = elements.taskProjectFilter;
    
    if (!coordSelect || !projSelect) return;
    
    const currentCoordVal = coordSelect.value;
    const currentProjVal = projSelect.value;
    
    if (updateCoords) {
        let coordHtml = '<option value="all">Todas as Coordenadorias</option>';
        let filteredCoords = state.coordenadorias;
        if (gerenciaVal !== 'all') {
            filteredCoords = state.coordenadorias.filter(c => c.gerencia_id == gerenciaVal);
        }
        filteredCoords.forEach(c => {
            coordHtml += `<option value="${c.id}">${c.sigla} - ${c.nome}</option>`;
        });
        coordSelect.innerHTML = coordHtml;
        
        // Restore previous selection if still available
        if (currentCoordVal && (currentCoordVal === 'all' || filteredCoords.some(c => c.id == currentCoordVal))) {
            coordSelect.value = currentCoordVal;
        } else if (filteredCoords.length === 1) {
            coordSelect.value = filteredCoords[0].id;
        } else {
            coordSelect.value = 'all';
        }
    }
    
    if (updateProjects) {
        const selectedCoordVal = coordSelect.value;
        let projHtml = '<option value="all">Todos os Projetos</option>';
        let filteredProjs = state.projetos;
        
        if (gerenciaVal !== 'all') {
            filteredProjs = filteredProjs.filter(p => p.gerencia_id == gerenciaVal);
        }
        if (selectedCoordVal !== 'all') {
            filteredProjs = filteredProjs.filter(p => p.coordenadoria_id == selectedCoordVal);
        }
        
        filteredProjs.forEach(p => {
            projHtml += `<option value="${p.id}">${p.nome}</option>`;
        });
        projSelect.innerHTML = projHtml;
        
        // Restore previous selection if still available
        if (currentProjVal && (currentProjVal === 'all' || filteredProjs.some(p => p.id == currentProjVal))) {
            projSelect.value = currentProjVal;
        } else if (filteredProjs.length === 1) {
            projSelect.value = filteredProjs[0].id;
        } else {
            projSelect.value = 'all';
        }
    }
}

function updateColabCoordinationDropdown(gerenciaId, selectedCoordId = '') {
    const colabCoordSelect = document.getElementById('colab-coordination');
    if (!colabCoordSelect) return;

    if (!gerenciaId) {
        colabCoordSelect.innerHTML = '<option value="">Escolha uma gerência primeiro...</option>';
        colabCoordSelect.disabled = true;
        return;
    }

    colabCoordSelect.disabled = false;
    let html = '<option value="">Sem Coordenadoria</option>';
    const filteredCoords = state.coordenadorias.filter(c => c.gerencia_id == gerenciaId);
    filteredCoords.forEach(c => {
        const coordName = getCoordinatorName(c.id);
        const coordSuffix = coordName ? ` (Coord: ${coordName})` : '';
        html += `<option value="${c.id}">${c.sigla} - ${c.nome}${coordSuffix}</option>`;
    });
    colabCoordSelect.innerHTML = html;
    if (filteredCoords.length === 1 && !selectedCoordId) {
        colabCoordSelect.value = filteredCoords[0].id;
    } else {
        colabCoordSelect.value = selectedCoordId || '';
    }
}

function updateReportCoordinationDropdown(gerenciaId) {
    const reportCoordSelect = document.getElementById('report-coordenadoria-filter');
    if (!reportCoordSelect) return;

    let html = '<option value="all">Todas as Coordenadorias</option>';
    let coordsToPopulate = state.coordenadorias;

    if (gerenciaId && gerenciaId !== 'all') {
        coordsToPopulate = state.coordenadorias.filter(c => c.gerencia_id == gerenciaId);
    }

    coordsToPopulate.forEach(c => {
        html += `<option value="${c.id}">${c.sigla} - ${c.nome}</option>`;
    });

    reportCoordSelect.innerHTML = html;
    reportCoordSelect.value = 'all';

    // Auto-select if only 1 option (excluding 'all')
    if (coordsToPopulate.length === 1) {
        reportCoordSelect.value = coordsToPopulate[0].id;
    }
}

function populateDropdowns() {
    // Project Gerência dropdown
    const projGerenciaSelect = document.getElementById('project-gerencia');
    if (projGerenciaSelect) {
        let gerenciaOptionsHtml = '<option value="" disabled selected>Escolha uma gerência...</option>';
        state.gerencias.forEach(g => {
            gerenciaOptionsHtml += `<option value="${g.id}">${g.sigla} - ${g.nome}</option>`;
        });
        projGerenciaSelect.innerHTML = gerenciaOptionsHtml;
        if (state.gerencias.length === 1) {
            projGerenciaSelect.value = state.gerencias[0].id;
            updateProjectCoordinationDropdown(state.gerencias[0].id);
        }
    }

    const taskAssigneeSelect = document.getElementById('task-assignee');
    const taskProjectSelect = document.getElementById('task-project');
    const taskProjectFilter = elements.taskProjectFilter;
    const coordGerenciaSelect = document.getElementById('coord-gerencia');

    // Collaborators option
    let colabOptionsHtml = '<option value="" disabled selected>Escolha um responsável...</option>';
    let coordCoordenadorHtml = '<option value="">Sem Coordenador</option>';
    let mgmtResponsavelHtml = '<option value="">Sem Responsável</option>';
    state.colaboradores.forEach(c => {
        colabOptionsHtml += `<option value="${c.id}">${c.nome} (${c.coordenadoria_sigla || 'Sem Setor'})</option>`;
        coordCoordenadorHtml += `<option value="${c.id}">${c.nome}</option>`;
        mgmtResponsavelHtml += `<option value="${c.id}">${c.nome}</option>`;
    });
    taskAssigneeSelect.innerHTML = colabOptionsHtml;
    const coordCoordenadorSelect = document.getElementById('coord-coordenador');
    if (coordCoordenadorSelect) {
        coordCoordenadorSelect.innerHTML = coordCoordenadorHtml;
    }
    const mgmtResponsavelSelect = document.getElementById('mgmt-responsavel');
    if (mgmtResponsavelSelect) {
        mgmtResponsavelSelect.innerHTML = mgmtResponsavelHtml;
    }

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
        if (state.gerencias.length === 1) {
            coordGerenciaSelect.value = state.gerencias[0].id;
        }
    }

    // Collaborator Gerência option
    const colabGerenciaSelect = document.getElementById('colab-gerencia');
    if (colabGerenciaSelect) {
        let gerenciaOptionsHtml = '<option value="" disabled selected>Escolha uma gerência...</option>';
        state.gerencias.forEach(g => {
            gerenciaOptionsHtml += `<option value="${g.id}">${g.sigla} - ${g.nome}</option>`;
        });
        colabGerenciaSelect.innerHTML = gerenciaOptionsHtml;
        if (state.gerencias.length === 1) {
            colabGerenciaSelect.value = state.gerencias[0].id;
            updateColabCoordinationDropdown(state.gerencias[0].id);
        }
    }

    // Subtask collaborator select option
    updateNewSubtaskAssigneeOptions();

    // Apontamento Collaborators dropdown
    const apontColabSelect = document.getElementById('apontamento-collaborator');
    if (apontColabSelect) {
        let colabOptionsHtml = '<option value="" disabled selected>Escolha o colaborador...</option>';
        state.colaboradores.forEach(c => {
            colabOptionsHtml += `<option value="${c.id}">${c.nome} (${c.coordenadoria_sigla || 'Sem Setor'})</option>`;
        });
        apontColabSelect.innerHTML = colabOptionsHtml;
    }

    // Apontamento Projects dropdown (Requires choosing a collaborator first)
    const apontProjSelect = document.getElementById('apontamento-project');
    if (apontProjSelect) {
        apontProjSelect.innerHTML = '<option value="" disabled selected>Selecione um colaborador primeiro...</option>';
        apontProjSelect.disabled = true;
    }

    // Populate collaborator multi-select profiles checkboxes list
    const colabProfilesList = document.getElementById('colab-profiles-list');
    if (colabProfilesList) {
        let profilesHtml = '';
        state.perfis.forEach(p => {
            profilesHtml += `
                <label style="display: flex; align-items: center; gap: 8px; font-size: 13.5px; cursor: pointer; user-select: none;">
                    <input type="checkbox" name="colab-profiles" value="${p.id}" style="width: 16px; height: 16px; accent-color: var(--primary); cursor: pointer; margin: 0;">
                    <span>${p.nome}</span>
                </label>
            `;
        });
        if (state.perfis.length === 0) {
            profilesHtml = '<span style="color: var(--text-muted); font-size: 13px;">Nenhum perfil cadastrado no sistema.</span>';
        }
        colabProfilesList.innerHTML = profilesHtml;
    }

    // Meses de Fechamento option
    const reportFechamentoSelect = elements.reportFechamento;
    if (reportFechamentoSelect) {
        const selectedVal = reportFechamentoSelect.value;
        let fechamentoHtml = '';
        if (state.mesesFechamento.length === 0) {
            fechamentoHtml = '<option value="" disabled selected>Nenhum período cadastrado</option>';
        } else {
            state.mesesFechamento.forEach(f => {
                fechamentoHtml += `<option value="${f.id}">${f.descricao}</option>`;
            });
        }
        reportFechamentoSelect.innerHTML = fechamentoHtml;
        const activePeriod = state.mesesFechamento.find(f => f.ativo);
        const defaultId = activePeriod ? activePeriod.id : (state.mesesFechamento.length > 0 ? state.mesesFechamento[0].id : '');
        if (selectedVal && state.mesesFechamento.some(f => f.id == selectedVal)) {
            reportFechamentoSelect.value = selectedVal;
        } else if (defaultId) {
            reportFechamentoSelect.value = defaultId;
        }
    }

    // Report filters (Monthly Closing)
    const reportGerenciaFilter = document.getElementById('report-gerencia-filter');
    if (reportGerenciaFilter) {
        let html = '<option value="all">Todas as Gerências</option>';
        state.gerencias.forEach(g => {
            html += `<option value="${g.id}">${g.sigla} - ${g.nome}</option>`;
        });
        reportGerenciaFilter.innerHTML = html;
        
        if (state.gerencias.length === 1) {
            reportGerenciaFilter.value = state.gerencias[0].id;
            reportGerenciaFilter.disabled = true; // Deixar fixo
            updateReportCoordinationDropdown(state.gerencias[0].id);
        } else {
            reportGerenciaFilter.value = 'all';
            reportGerenciaFilter.disabled = false;
            updateReportCoordinationDropdown('all');
        }
    }

    // Apontamento Period filter dropdown
    const apontamentoPeriodFilterSelect = elements.apontamentoPeriodFilter;
    if (apontamentoPeriodFilterSelect) {
        const selectedVal = apontamentoPeriodFilterSelect.value;
        let periodHtml = '';
        if (state.mesesFechamento.length === 0) {
            periodHtml = '<option value="" disabled selected>Nenhum período cadastrado</option>';
        } else {
            state.mesesFechamento.forEach(f => {
                periodHtml += `<option value="${f.id}">${f.descricao}</option>`;
            });
        }
        apontamentoPeriodFilterSelect.innerHTML = periodHtml;
        const activePeriod = state.mesesFechamento.find(f => f.ativo);
        const defaultId = activePeriod ? activePeriod.id : (state.mesesFechamento.length > 0 ? state.mesesFechamento[0].id : '');
        if (selectedVal && state.mesesFechamento.some(f => f.id == selectedVal)) {
            apontamentoPeriodFilterSelect.value = selectedVal;
        } else if (defaultId) {
            apontamentoPeriodFilterSelect.value = defaultId;
        }
    }

    // Requesters options
    const taskRequesterSelect = document.getElementById('task-requester');
    if (taskRequesterSelect) {
        let reqOptionsHtml = '<option value="">Nenhum</option>';
        state.solicitantes.forEach(s => {
            reqOptionsHtml += `<option value="${s.id}">${s.nome} (${s.setor})</option>`;
        });
        taskRequesterSelect.innerHTML = reqOptionsHtml;
    }

    // Task board filters
    const taskGerenciaFilter = elements.taskGerenciaFilter;
    if (taskGerenciaFilter) {
        const currentGerenciaVal = taskGerenciaFilter.value;
        let gerenciaFilterHtml = '<option value="all">Todas as Gerências</option>';
        state.gerencias.forEach(g => {
            gerenciaFilterHtml += `<option value="${g.id}">${g.sigla} - ${g.nome}</option>`;
        });
        taskGerenciaFilter.innerHTML = gerenciaFilterHtml;
        if (state.gerencias.length === 1) {
            taskGerenciaFilter.value = state.gerencias[0].id;
        } else if (currentGerenciaVal && (currentGerenciaVal === 'all' || state.gerencias.some(g => g.id == currentGerenciaVal))) {
            taskGerenciaFilter.value = currentGerenciaVal;
        } else {
            taskGerenciaFilter.value = 'all';
        }
    }
    updateTaskBoardFilters(true, true);
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
            const formattedDate = formatDate(p.data_inicio);
            const coordinatorName = getCoordinatorName(p.coordenadoria_id);
            html += `
                <tr>
                    <td style="font-weight: 600;">${p.nome}</td>
                    <td>
                        <span class="project-coord-badge">${p.coordenadoria_sigla || 'N/A'}</span>
                        ${coordinatorName ? `
                        <div style="font-size: 10px; color: var(--text-muted); margin-top: 3px;">
                            <i class="fa-solid fa-circle-user" style="font-size: 9px; margin-right: 2px;"></i> ${coordinatorName}
                        </div>` : ''}
                    </td>
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
            const startStr = formatDate(p.data_inicio);
            const endStr = p.data_fim ? formatDate(p.data_fim) : 'Sem Prazo';
            const coordinatorName = getCoordinatorName(p.coordenadoria_id);

            html += `
                <div class="project-card glass" ondblclick="editProject(${p.id})" style="cursor: pointer;" title="Duplo clique para editar">
                    <div class="project-card-header">
                        <div>
                            <h4>${p.nome}</h4>
                            <span class="project-coord-badge" style="margin-top: 6px; display: inline-block;">
                                ${p.coordenadoria_sigla || 'Sem Coord.'}
                            </span>
                            ${coordinatorName ? `
                            <span class="project-coord-badge" style="margin-top: 6px; display: inline-block; background: rgba(59, 130, 246, 0.15); color: var(--accent-blue); border-color: rgba(59, 130, 246, 0.3);">
                                <i class="fa-solid fa-circle-user" style="font-size: 10px; margin-right: 4px;"></i>Coordenador: ${coordinatorName}
                            </span>
                            ` : ''}
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
    const gerenciaFilter = elements.taskGerenciaFilter ? elements.taskGerenciaFilter.value : 'all';
    const coordFilter = elements.taskCoordenadoriaFilter ? elements.taskCoordenadoriaFilter.value : 'all';
    const projectFilter = elements.taskProjectFilter ? elements.taskProjectFilter.value : 'all';
    
    // Filter tasks
    const filteredTasks = state.tarefas.filter(t => {
        const proj = state.projetos.find(p => p.id == t.projeto_id);
        if (!proj) return false;

        if (gerenciaFilter !== 'all' && proj.gerencia_id != gerenciaFilter) {
            return false;
        }

        if (coordFilter !== 'all' && proj.coordenadoria_id != coordFilter) {
            return false;
        }

        if (projectFilter !== 'all' && t.projeto_id != projectFilter) {
            return false;
        }

        return true;
    });

    // Clear board columns
    elements.tasksTodoContainer.innerHTML = '';
    elements.tasksProgressContainer.innerHTML = '';
    elements.tasksDoneContainer.innerHTML = '';

    let todoCount = 0;
    let progressCount = 0;
    let doneCount = 0;

    filteredTasks.forEach(t => {
        // Generate Subtasks HTML inside the card
        let subtasksHtml = '';
        if (t.subtasks && t.subtasks.length > 0) {
            subtasksHtml = `<div class="task-card-subtasks">`;
            t.subtasks.forEach(s => {
                const checkedAttr = s.concluida ? 'checked' : '';
                const completedClass = s.concluida ? 'completed' : '';
                const companyName = s.colaborador_empresa ? ` (${s.colaborador_empresa})` : '';
                const assigneeName = s.colaborador_nome ? ` (${s.colaborador_nome}${companyName})` : '';
                subtasksHtml += `
                    <div class="task-card-subtask ${completedClass}">
                        <input type="checkbox" ${checkedAttr} onclick="event.stopPropagation(); toggleSubtask(${s.id}, this.checked)">
                        <span title="${s.titulo}${assigneeName}">
                            ${s.titulo}
                            ${s.colaborador_nome ? ` <span style="color: var(--text-muted); font-size: 9.5px; font-style: italic; font-weight: normal; margin-left: 2px;">(${s.colaborador_nome}${companyName})</span>` : ''}
                        </span>
                    </div>
                `;
            });
            subtasksHtml += `</div>`;
        }

        const colab = state.colaboradores.find(c => c.id == t.colaborador_id);
        const coordinatorName = (colab && colab.coordenadoria_id) ? getCoordinatorName(colab.coordenadoria_id) : '';

        const cardHtml = `
            <div class="task-card" onclick="openEditTaskModal(${t.id})">
                <div class="task-card-header">
                    <span class="task-project-name">${t.projeto_nome}</span>
                    <span class="task-priority priority-${t.prioridade.toLowerCase()}">${t.prioridade}</span>
                </div>
                <h5>${t.titulo}</h5>
                <p>${t.descricao || 'Sem descrição.'}</p>
                ${subtasksHtml}
                <div class="task-card-footer">
                    <div style="display: flex; flex-direction: column; gap: 4px; align-items: flex-start;">
                        <div class="task-assignee">
                            <i class="fa-solid fa-circle-user"></i>
                            <span>${t.colaborador_nome || 'Sem Responsável'}</span>
                        </div>
                        ${coordinatorName ? `
                        <div class="task-coordinator" style="font-size: 11px; color: var(--text-muted); display: flex; align-items: center; gap: 8px;">
                            <i class="fa-solid fa-user-tie" style="font-size: 10.5px; color: var(--text-muted);"></i>
                            <span>Coord: ${coordinatorName}</span>
                        </div>
                        ` : ''}
                    </div>
                    ${t.solicitante_nome ? `
                    <div class="task-assignee" title="Solicitante: ${t.solicitante_nome}" style="align-self: flex-start;">
                        <i class="fa-solid fa-paper-plane" style="font-size: 10px; color: var(--text-muted);"></i>
                        <span style="font-size: 11px; color: var(--text-muted);">${t.solicitante_nome}</span>
                    </div>
                    ` : ''}
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
        colabHtml = '<tr><td colspan="6" style="text-align: center; color: var(--text-muted);">Nenhum colaborador registrado.</td></tr>';
    } else {
        state.colaboradores.forEach(c => {
            colabHtml += `
                <tr ondblclick="editCollaborator(${c.id})" style="cursor: pointer;" title="Duplo clique para editar">
                    <td style="font-weight: 600;">${c.nome}</td>
                    <td>${c.cpf || '-'}</td>
                    <td>${c.cargo}</td>
                    <td>${c.email}</td>
                    <td><span class="project-coord-badge">${c.gerencia_sigla || 'Sem Gerência'}</span>${c.coordenadoria_sigla ? ` / <span class="project-coord-badge">${c.coordenadoria_sigla}</span>` : ''}</td>
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
        coordHtml = '<tr><td colspan="5" style="text-align: center; color: var(--text-muted);">Nenhuma coordenadoria.</td></tr>';
    } else {
        state.coordenadorias.forEach(c => {
            coordHtml += `
                <tr ondblclick="editCoordination(${c.id})" style="cursor: pointer;" title="Duplo clique para editar">
                    <td style="font-weight: 700; color: var(--primary-hover);">${c.sigla}</td>
                    <td>${c.nome}</td>
                    <td><span class="project-coord-badge">${c.gerencia_sigla || 'Sem Gerência'}</span></td>
                    <td>${c.coordenador_nome || 'Sem Coordenador'}</td>
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
        mgmtHtml = '<tr><td colspan="4" style="text-align: center; color: var(--text-muted);">Nenhuma gerência.</td></tr>';
    } else {
        state.gerencias.forEach(g => {
            mgmtHtml += `
                <tr ondblclick="editManagement(${g.id})" style="cursor: pointer;" title="Duplo clique para editar">
                    <td style="font-weight: 700; color: var(--accent-blue);">${g.sigla}</td>
                    <td>${g.nome}</td>
                    <td>${g.responsavel_nome || 'Sem Responsável'}</td>
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

function renderRequestersTab() {
    let reqHtml = '';
    if (state.solicitantes.length === 0) {
        reqHtml = '<tr><td colspan="3" style="text-align: center; color: var(--text-muted);">Nenhum solicitante registrado.</td></tr>';
    } else {
        state.solicitantes.forEach(s => {
            reqHtml += `
                <tr ondblclick="editRequester(${s.id})" style="cursor: pointer;" title="Duplo clique para editar">
                    <td style="font-weight: 600;">${s.nome}</td>
                    <td>${s.setor}</td>
                    <td style="text-align: right;">
                        <button class="btn btn-secondary btn-sm" onclick="editRequester(${s.id})" style="padding: 4px 8px; margin-right: 4px;">
                            <i class="fa-solid fa-pen" style="font-size: 11px;"></i>
                        </button>
                        <button class="btn btn-danger btn-sm" onclick="deleteRequester(${s.id})" style="padding: 4px 8px;">
                            <i class="fa-solid fa-trash" style="font-size: 11px;"></i>
                        </button>
                    </td>
                </tr>
            `;
        });
    }
    elements.requestersList.innerHTML = reqHtml;
}

function renderProfilesTab() {
    let profHtml = '';
    if (state.perfis.length === 0) {
        profHtml = '<tr><td colspan="2" style="text-align: center; color: var(--text-muted);">Nenhum perfil registrado.</td></tr>';
    } else {
        state.perfis.forEach(p => {
            profHtml += `
                <tr ondblclick="editProfile(${p.id})" style="cursor: pointer;" title="Duplo clique para editar">
                    <td style="font-weight: 600;">${p.nome}</td>
                    <td style="text-align: right;">
                        <button class="btn btn-secondary btn-sm" onclick="editProfile(${p.id})" style="padding: 4px 8px; margin-right: 4px;">
                            <i class="fa-solid fa-pen" style="font-size: 11px;"></i>
                        </button>
                        <button class="btn btn-danger btn-sm" onclick="deleteProfile(${p.id})" style="padding: 4px 8px;">
                            <i class="fa-solid fa-trash" style="font-size: 11px;"></i>
                        </button>
                    </td>
                </tr>
            `;
        });
    }
    elements.profilesList.innerHTML = profHtml;
    
    renderFunctionalitiesTab();
}

function renderProfileLinkedColabs() {
    const tbody = document.getElementById('profile-linked-colabs-body');
    if (!tbody) return;

    let html = '';
    if (currentProfileLinkedColabs.length === 0) {
        html = '<tr><td colspan="3" style="text-align: center; color: var(--text-muted);">Nenhum colaborador vinculado.</td></tr>';
    } else {
        currentProfileLinkedColabs.forEach(colabId => {
            const colab = state.colaboradores.find(c => c.id === colabId);
            if (colab) {
                html += `
                    <tr>
                        <td style="padding: 6px 8px;">${colab.nome}</td>
                        <td style="padding: 6px 8px;">${colab.cpf || '-'}</td>
                        <td style="width: 70px; text-align: right; padding: 6px 8px;">
                            <button type="button" class="btn btn-danger btn-sm" onclick="removeColabFromProfile(${colab.id})" style="padding: 2px 6px;">
                                <i class="fa-solid fa-xmark"></i>
                            </button>
                        </td>
                    </tr>
                `;
            }
        });
    }
    tbody.innerHTML = html;
}

window.removeColabFromProfile = function(colabId) {
    currentProfileLinkedColabs = currentProfileLinkedColabs.filter(id => id !== colabId);
    renderProfileLinkedColabs();
};

function populateProfileColabDropdown() {
    const select = document.getElementById('profile-colab-select');
    if (!select) return;

    let html = '<option value="" disabled selected>Escolha...</option>';
    state.colaboradores.forEach(c => {
        html += `<option value="${c.id}">${c.nome} (${c.cpf || 'Sem CPF'})</option>`;
    });
    select.innerHTML = html;
}

// --- 5. RENDERING: MONTHLY CLOSING REPORT ---
async function generateMonthlyReport() {
    const fechamentoId = elements.reportFechamento.value;
    if (!fechamentoId) {
        document.getElementById('report-projects-body').innerHTML = '<tr><td colspan="7" style="text-align: center; color: var(--text-muted);">Por favor, selecione ou cadastre um período de fechamento.</td></tr>';
        document.getElementById('report-collaborators-body').innerHTML = '<tr><td colspan="6" style="text-align: center; color: var(--text-muted);">Por favor, selecione ou cadastre um período de fechamento.</td></tr>';
        return;
    }

    try {
        const report = await fetch(`/api/relatorios/fechamento?fechamento_id=${fechamentoId}`).then(r => r.json());

        if (report.error) {
            console.error(report.error);
            return;
        }

        state.currentReport = report;
        renderReportTables();
    } catch (err) {
        console.error('Error generating report:', err);
    }
}

function renderReportTables() {
    if (!state.currentReport) return;

    const report = state.currentReport;
    const gerenciaFilter = document.getElementById('report-gerencia-filter').value;
    const coordenadoriaFilter = document.getElementById('report-coordenadoria-filter').value;

    // Set period description and vigency dates in header
    const period = report.period;
    const startStr = formatDate(period.data_inicio);
    const endStr = formatDate(period.data_fim);
    const periodText = `${period.descricao} (${startStr} a ${endStr})`;
    
    document.getElementById('project-report-period').textContent = periodText;
    document.getElementById('collaborator-report-period').textContent = periodText;

    // Filter Projects
    let filteredProjects = report.projetos;
    if (gerenciaFilter && gerenciaFilter !== 'all') {
        filteredProjects = filteredProjects.filter(p => {
            const origProj = state.projetos.find(proj => proj.id == p.projeto_id);
            return origProj && origProj.gerencia_id == gerenciaFilter;
        });
    }
    if (coordenadoriaFilter && coordenadoriaFilter !== 'all') {
        filteredProjects = filteredProjects.filter(p => {
            const origProj = state.projetos.find(proj => proj.id == p.projeto_id);
            return origProj && origProj.coordenadoria_id == coordenadoriaFilter;
        });
    }

    // Render Projects Summary
    let projHtml = '';
    if (filteredProjects.length === 0) {
        projHtml = '<tr><td colspan="7" style="text-align: center; color: var(--text-muted);">Nenhum projeto encontrado para os filtros selecionados.</td></tr>';
    } else {
        filteredProjects.forEach(p => {
            const estHours = p.total_horas_estimadas ? Math.round(p.total_horas_estimadas) : 0;
            const workedHours = p.total_horas_trabalhadas ? Math.round(p.total_horas_trabalhadas) : 0;
            
            const origProj = state.projetos.find(proj => proj.id == p.projeto_id);
            const coordinatorName = origProj ? getCoordinatorName(origProj.coordenadoria_id) : '';
            
            projHtml += `
                <tr>
                    <td style="font-weight: 600;">${p.projeto_nome}</td>
                    <td>
                        <span class="project-coord-badge">${p.coordenadoria_sigla || 'N/A'}</span>
                        ${coordinatorName ? `
                        <div style="font-size: 10px; color: var(--text-muted); margin-top: 3px;">
                            <i class="fa-solid fa-circle-user" style="font-size: 9px; margin-right: 2px;"></i> ${coordinatorName}
                        </div>` : ''}
                    </td>
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

    // Filter Collaborators
    let filteredCollaborators = report.colaboradores;
    if (gerenciaFilter && gerenciaFilter !== 'all') {
        filteredCollaborators = filteredCollaborators.filter(c => {
            const origColab = state.colaboradores.find(col => col.id == c.colaborador_id);
            return origColab && origColab.gerencia_id == gerenciaFilter;
        });
    }
    if (coordenadoriaFilter && coordenadoriaFilter !== 'all') {
        filteredCollaborators = filteredCollaborators.filter(c => {
            const origColab = state.colaboradores.find(col => col.id == c.colaborador_id);
            return origColab && origColab.coordenadoria_id == coordenadoriaFilter;
        });
    }

    // Render Collaborators Summary
    let colabHtml = '';
    if (filteredCollaborators.length === 0) {
        colabHtml = '<tr><td colspan="6" style="text-align: center; color: var(--text-muted);">Nenhum colaborador encontrado para os filtros selecionados.</td></tr>';
    } else {
        filteredCollaborators.forEach(c => {
            const workedHours = c.total_horas_trabalhadas ? Math.round(c.total_horas_trabalhadas) : 0;
            
            colabHtml += `
                <tr onclick="generateCollaboratorPDF(${c.colaborador_id})" style="cursor: pointer;" title="Clique para gerar PDF de apontamentos deste colaborador">
                    <td style="font-weight: 600; color: var(--primary-hover);">${c.colaborador_nome} <i class="fa-solid fa-file-pdf" style="margin-left: 5px; font-size: 11.5px; opacity: 0.8;"></i></td>
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
}

window.generateAllCollaboratorsPDF = function() {
    const fechamentoId = elements.reportFechamento.value;
    if (!fechamentoId) return;

    const period = state.mesesFechamento.find(p => p.id == fechamentoId);
    if (!period) return;

    const gerenciaFilter = document.getElementById('report-gerencia-filter').value;
    const coordenadoriaFilter = document.getElementById('report-coordenadoria-filter').value;

    let filteredCollaborators = [];
    if (state.currentReport && state.currentReport.colaboradores) {
        filteredCollaborators = state.currentReport.colaboradores;
        if (gerenciaFilter && gerenciaFilter !== 'all') {
            filteredCollaborators = filteredCollaborators.filter(c => {
                const origColab = state.colaboradores.find(col => col.id == c.colaborador_id);
                return origColab && origColab.gerencia_id == gerenciaFilter;
            });
        }
        if (coordenadoriaFilter && coordenadoriaFilter !== 'all') {
            filteredCollaborators = filteredCollaborators.filter(c => {
                const origColab = state.colaboradores.find(col => col.id == c.colaborador_id);
                return origColab && origColab.coordenadoria_id == coordenadoriaFilter;
            });
        }
    }

    if (filteredCollaborators.length === 0) {
        alert('Nenhum colaborador encontrado para gerar o relatório.');
        return;
    }

    const printWindow = window.open('', '_blank');
    if (!printWindow) {
        alert('Por favor, permita pop-ups para gerar o PDF.');
        return;
    }

    const startStr = formatDate(period.data_inicio);
    const endStr = formatDate(period.data_fim);

    let htmlContent = `
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="utf-8">
            <title>Fechamento Consolidado de Apontamentos</title>
            <style>
                body {
                    font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;
                    color: #333;
                    margin: 40px;
                    font-size: 13px;
                    line-height: 1.4;
                }
                .collaborator-section {
                    page-break-after: always;
                }
                .collaborator-section:last-child {
                    page-break-after: avoid;
                }
                .header {
                    border-bottom: 2px solid #6d28d9;
                    padding-bottom: 15px;
                    margin-bottom: 20px;
                }
                .header-title {
                    font-size: 20px;
                    font-weight: bold;
                    color: #111;
                    margin: 0 0 8px 0;
                }
                .meta-grid {
                    display: grid;
                    grid-template-columns: repeat(2, 1fr);
                    gap: 10px;
                    margin-top: 10px;
                }
                .meta-item {
                    font-size: 12.5px;
                }
                .meta-label {
                    font-weight: bold;
                    color: #555;
                }
                .meta-value {
                    color: #111;
                }
                table {
                    width: 100%;
                    border-collapse: collapse;
                    margin-top: 15px;
                    margin-bottom: 25px;
                }
                th, td {
                    border: 1px solid #ddd;
                    padding: 8px 10px;
                    text-align: left;
                    font-size: 12px;
                }
                th {
                    background-color: #f3f4f6;
                    font-weight: bold;
                    color: #374151;
                }
                tr:nth-child(even) {
                    background-color: #fafafa;
                }
                .footer {
                    margin-top: 30px;
                    border-top: 1px solid #ddd;
                    padding-top: 15px;
                    font-size: 11px;
                    color: #666;
                    display: flex;
                    justify-content: space-between;
                }
                @media print {
                    body {
                        margin: 20px;
                    }
                }
            </style>
        </head>
        <body>
    `;

    filteredCollaborators.forEach(c => {
        const colab = state.colaboradores.find(col => col.id == c.colaborador_id);
        if (!colab) return;

        // Filter pointing records for this collaborator and period
        const colabPointings = state.apontamentos.filter(a => {
            if (a.colaborador_id != c.colaborador_id) return false;
            
            const aDate = typeof a.data_apontamento === 'object' ? a.data_apontamento.toISOString().split('T')[0] : String(a.data_apontamento).split('T')[0];
            const pStart = typeof period.data_inicio === 'object' ? period.data_inicio.toISOString().split('T')[0] : String(period.data_inicio).split('T')[0];
            const pEnd = typeof period.data_fim === 'object' ? period.data_fim.toISOString().split('T')[0] : String(period.data_fim).split('T')[0];
            
            return aDate >= pStart && aDate <= pEnd;
        });

        // Sort by date ascending
        colabPointings.sort((a, b) => {
            const dateA = typeof a.data_apontamento === 'object' ? a.data_apontamento.toISOString() : String(a.data_apontamento);
            const dateB = typeof b.data_apontamento === 'object' ? b.data_apontamento.toISOString() : String(b.data_apontamento);
            return dateA.localeCompare(dateB);
        });

        const totalHours = colabPointings.reduce((sum, a) => sum + (a.horas ? parseFloat(a.horas) : 0), 0);

        let rowsHtml = '';
        if (colabPointings.length === 0) {
            rowsHtml = '<tr><td colspan="8" style="text-align: center; color: #666; padding: 15px;">Nenhum apontamento registrado neste período.</td></tr>';
        } else {
            colabPointings.forEach(a => {
                const dateStr = formatDate(a.data_apontamento);
                const hoursStr = a.horas !== null && a.horas !== undefined ? `${a.horas}h` : '-';
                
                const task = state.tarefas.find(t => t.id == a.tarefa_id);
                const taskStatus = task ? task.status : 'N/A';
                const requesterName = task ? (task.solicitante_nome || 'N/A') : 'N/A';

                let statusColor = '#333';
                if (taskStatus === 'Concluída') statusColor = '#10b981';
                else if (taskStatus === 'Em Progresso') statusColor = '#3b82f6';
                else if (taskStatus === 'A Fazer') statusColor = '#6b7280';

                rowsHtml += `
                    <tr>
                        <td style="white-space: nowrap;">${dateStr}</td>
                        <td>${a.projeto_nome || 'N/A'}</td>
                        <td>${a.tarefa_titulo || 'N/A'}</td>
                        <td style="color: ${statusColor}; font-weight: 600; white-space: nowrap;">${taskStatus}</td>
                        <td>${requesterName}</td>
                        <td>${a.subtarefa_titulo || 'Atividade Geral'}</td>
                        <td style="text-align: right; font-weight: bold;">${hoursStr}</td>
                        <td>${a.descricao || ''}</td>
                    </tr>
                `;
            });
        }

        htmlContent += `
            <div class="collaborator-section">
                <div class="header">
                    <div class="header-title">Relatório Individual de Apontamentos</div>
                    <div class="meta-grid">
                        <div class="meta-item">
                            <span class="meta-label">Colaborador:</span>
                            <span class="meta-value" style="font-weight: bold;">${colab.nome}</span>
                        </div>
                        <div class="meta-item">
                            <span class="meta-label">Período:</span>
                            <span class="meta-value">${period.descricao} (${startStr} a ${endStr})</span>
                        </div>
                        <div class="meta-item">
                            <span class="meta-label">Setor:</span>
                            <span class="meta-value">${colab.coordenadoria_sigla || 'Sem Setor'}</span>
                        </div>
                        <div class="meta-item">
                            <span class="meta-label">Total de Horas:</span>
                            <span class="meta-value" style="font-weight: bold; color: #6d28d9;">${totalHours.toFixed(1)}h</span>
                        </div>
                    </div>
                </div>

                <table>
                    <thead>
                        <tr>
                            <th style="width: 80px;">Data</th>
                            <th style="width: 110px;">Projeto</th>
                            <th style="width: 120px;">Tarefa</th>
                            <th style="width: 80px;">Status</th>
                            <th style="width: 90px;">Solicitante</th>
                            <th style="width: 90px;">Sub-tarefa</th>
                            <th style="width: 45px; text-align: right;">Horas</th>
                            <th>Descrição da Atividade</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${rowsHtml}
                    </tbody>
                </table>

                <div class="footer">
                    <span>Gerado automaticamente pelo sistema de Gestão de Tarefas</span>
                    <span>Data da geração: ${new Date().toLocaleDateString('pt-BR')} às ${new Date().toLocaleTimeString('pt-BR')}</span>
                </div>
            </div>
        `;
    });

    htmlContent += `
            <script>
                window.onload = function() {
                    setTimeout(function() {
                        window.print();
                    }, 400);
                }
            </script>
        </body>
        </html>
    `;

    printWindow.document.write(htmlContent);
    printWindow.document.close();
};

window.generateCollaboratorPDF = function(collaboratorId, customPeriodId = null) {
    const fechamentoId = customPeriodId || elements.reportFechamento.value;
    if (!fechamentoId) return;

    const period = state.mesesFechamento.find(p => p.id == fechamentoId);
    if (!period) return;

    const colab = state.colaboradores.find(c => c.id == collaboratorId);
    if (!colab) return;

    // Filter pointing records for this collaborator and period
    const colabPointings = state.apontamentos.filter(a => {
        if (a.colaborador_id != collaboratorId) return false;
        
        const aDate = typeof a.data_apontamento === 'object' ? a.data_apontamento.toISOString().split('T')[0] : String(a.data_apontamento).split('T')[0];
        const pStart = typeof period.data_inicio === 'object' ? period.data_inicio.toISOString().split('T')[0] : String(period.data_inicio).split('T')[0];
        const pEnd = typeof period.data_fim === 'object' ? period.data_fim.toISOString().split('T')[0] : String(period.data_fim).split('T')[0];
        
        return aDate >= pStart && aDate <= pEnd;
    });

    // Sort by date ascending
    colabPointings.sort((a, b) => {
        const dateA = typeof a.data_apontamento === 'object' ? a.data_apontamento.toISOString() : String(a.data_apontamento);
        const dateB = typeof b.data_apontamento === 'object' ? b.data_apontamento.toISOString() : String(b.data_apontamento);
        return dateA.localeCompare(dateB);
    });

    const startStr = formatDate(period.data_inicio);
    const endStr = formatDate(period.data_fim);
    const totalHours = colabPointings.reduce((sum, a) => sum + (a.horas ? parseFloat(a.horas) : 0), 0);

    const printWindow = window.open('', '_blank');
    if (!printWindow) {
        alert('Por favor, permita pop-ups para gerar o PDF.');
        return;
    }

    let rowsHtml = '';
    if (colabPointings.length === 0) {
        rowsHtml = '<tr><td colspan="8" style="text-align: center; color: #666; padding: 20px;">Nenhum apontamento registrado neste período.</td></tr>';
    } else {
        colabPointings.forEach(a => {
            const dateStr = formatDate(a.data_apontamento);
            const hoursStr = a.horas !== null && a.horas !== undefined ? `${a.horas}h` : '-';
            
            // Find task details client-side
            const task = state.tarefas.find(t => t.id == a.tarefa_id);
            const taskStatus = task ? task.status : 'N/A';
            const requesterName = task ? (task.solicitante_nome || 'N/A') : 'N/A';

            let statusColor = '#333';
            if (taskStatus === 'Concluída') statusColor = '#10b981';
            else if (taskStatus === 'Em Progresso') statusColor = '#3b82f6';
            else if (taskStatus === 'A Fazer') statusColor = '#6b7280';

            rowsHtml += `
                <tr>
                    <td style="white-space: nowrap;">${dateStr}</td>
                    <td>${a.projeto_nome || 'N/A'}</td>
                    <td>${a.tarefa_titulo || 'N/A'}</td>
                    <td style="color: ${statusColor}; font-weight: 600; white-space: nowrap;">${taskStatus}</td>
                    <td>${requesterName}</td>
                    <td>${a.subtarefa_titulo || 'Atividade Geral'}</td>
                    <td style="text-align: right; font-weight: bold;">${hoursStr}</td>
                    <td>${a.descricao || ''}</td>
                </tr>
            `;
        });
    }

    const htmlContent = `
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="utf-8">
            <title>Relatório de Apontamentos - ${colab.nome}</title>
            <style>
                body {
                    font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;
                    color: #333;
                    margin: 40px;
                    font-size: 14px;
                    line-height: 1.5;
                }
                .header {
                    border-bottom: 2px solid #6d28d9;
                    padding-bottom: 20px;
                    margin-bottom: 30px;
                }
                .header-title {
                    font-size: 24px;
                    font-weight: bold;
                    color: #111;
                    margin: 0 0 10px 0;
                }
                .meta-grid {
                    display: grid;
                    grid-template-columns: repeat(2, 1fr);
                    gap: 15px;
                    margin-top: 15px;
                }
                .meta-item {
                    font-size: 13.5px;
                }
                .meta-label {
                    font-weight: bold;
                    color: #666;
                }
                .meta-value {
                    color: #111;
                }
                table {
                    width: 100%;
                    border-collapse: collapse;
                    margin-top: 20px;
                }
                th, td {
                    border: 1px solid #ddd;
                    padding: 10px 12px;
                    text-align: left;
                    font-size: 13px;
                }
                th {
                    background-color: #f3f4f6;
                    font-weight: bold;
                    color: #374151;
                }
                tr:nth-child(even) {
                    background-color: #fafafa;
                }
                .footer {
                    margin-top: 50px;
                    border-top: 1px solid #ddd;
                    padding-top: 20px;
                    font-size: 12px;
                    color: #666;
                    display: flex;
                    justify-content: space-between;
                }
                @media print {
                    body {
                        margin: 20px;
                    }
                    .no-print {
                        display: none;
                    }
                }
            </style>
        </head>
        <body>
            <div class="header">
                <div class="header-title">Relatório Individual de Apontamentos</div>
                <div class="meta-grid">
                    <div class="meta-item">
                        <span class="meta-label">Colaborador:</span>
                        <span class="meta-value" style="font-weight: bold;">${colab.nome}</span>
                    </div>
                    <div class="meta-item">
                        <span class="meta-label">Período:</span>
                        <span class="meta-value">${period.descricao} (${startStr} a ${endStr})</span>
                    </div>
                    <div class="meta-item">
                        <span class="meta-label">Setor:</span>
                        <span class="meta-value">${colab.coordenadoria_sigla || 'Sem Setor'}</span>
                    </div>
                    <div class="meta-item">
                        <span class="meta-label">Total de Horas:</span>
                        <span class="meta-value" style="font-weight: bold; color: #6d28d9;">${totalHours.toFixed(1)}h</span>
                    </div>
                </div>
            </div>

            <table>
                <thead>
                    <tr>
                        <th style="width: 85px;">Data</th>
                        <th style="width: 120px;">Projeto</th>
                        <th style="width: 130px;">Tarefa</th>
                        <th style="width: 90px;">Status</th>
                        <th style="width: 100px;">Solicitante</th>
                        <th style="width: 100px;">Sub-tarefa</th>
                        <th style="width: 50px; text-align: right;">Horas</th>
                        <th>Descrição da Atividade</th>
                    </tr>
                </thead>
                <tbody>
                    ${rowsHtml}
                </tbody>
            </table>

            <div class="footer">
                <span>Gerado automaticamente pelo sistema de Gestão de Tarefas</span>
                <span>Data da geração: ${new Date().toLocaleDateString('pt-BR')} às ${new Date().toLocaleTimeString('pt-BR')}</span>
            </div>

            <script>
                window.onload = function() {
                    setTimeout(function() {
                        window.print();
                    }, 300);
                }
            </script>
        </body>
        </html>
    `;

    printWindow.document.write(htmlContent);
    printWindow.document.close();
}

// --- FORM HANDLING: SUBMITS ---

async function handleProjectSubmit(e) {
    e.preventDefault();
    const id = document.getElementById('project-id').value;
    const payload = {
        nome: document.getElementById('project-name').value,
        descricao: document.getElementById('project-desc').value,
        data_inicio: document.getElementById('project-start').value,
        data_fim: document.getElementById('project-end').value || null,
        gerencia_id: parseInt(document.getElementById('project-gerencia').value),
        coordenadoria_id: document.getElementById('project-coordination').value ? parseInt(document.getElementById('project-coordination').value) : null,
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
        solicitante_id: document.getElementById('task-requester').value || null
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
    
    // Collect checked profile IDs
    const checkedProfileBoxes = document.querySelectorAll('input[name="colab-profiles"]:checked');
    const perfil_ids = Array.from(checkedProfileBoxes).map(cb => parseInt(cb.value));

    const payload = {
        nome: document.getElementById('colab-name').value,
        email: document.getElementById('colab-email').value,
        cargo: document.getElementById('colab-role').value,
        gerencia_id: parseInt(document.getElementById('colab-gerencia').value),
        coordenadoria_id: document.getElementById('colab-coordination').value ? parseInt(document.getElementById('colab-coordination').value) : null,
        cpf: document.getElementById('colab-cpf').value,
        senha: document.getElementById('colab-password').value,
        perfil_ids
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
    const coordVal = document.getElementById('coord-coordenador').value;
    const payload = {
        sigla: document.getElementById('coord-sigla').value,
        nome: document.getElementById('coord-name').value,
        gerencia_id: parseInt(document.getElementById('coord-gerencia').value),
        coordenador_id: coordVal ? parseInt(coordVal) : null
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
    const respVal = document.getElementById('mgmt-responsavel').value;
    const payload = {
        sigla: document.getElementById('mgmt-sigla').value,
        nome: document.getElementById('mgmt-name').value,
        responsavel_id: respVal ? parseInt(respVal) : null
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

async function handleRequesterSubmit(e) {
    e.preventDefault();
    const id = document.getElementById('requester-id').value;
    const payload = {
        nome: document.getElementById('requester-name').value,
        setor: document.getElementById('requester-sector').value
    };

    try {
        let res;
        if (id) {
            // Edit mode
            res = await fetch(`/api/solicitantes/${id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            }).then(r => r.json());
        } else {
            // Create mode
            res = await fetch('/api/solicitantes', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            }).then(r => r.json());
        }

        closeModal(elements.modalRequester);
        await loadBaseData();
        renderCurrentTab();
    } catch (err) {
        console.error('Error submitting requester:', err);
    }
}

async function handleProfileSubmit(e) {
    e.preventDefault();
    const id = document.getElementById('profile-id').value;
    
    // Read checked functionalities checkboxes
    const checkedFuncBoxes = document.querySelectorAll('#profile-functionalities-list input[type="checkbox"]:checked');
    const funcionalidade_ids = Array.from(checkedFuncBoxes).map(cb => parseInt(cb.value));

    const payload = {
        nome: document.getElementById('profile-name').value,
        colaborador_ids: currentProfileLinkedColabs,
        funcionalidade_ids: funcionalidade_ids
    };

    try {
        let res;
        if (id) {
            // Edit mode
            res = await fetch(`/api/perfis/${id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            }).then(r => r.json());
        } else {
            // Create mode
            res = await fetch('/api/perfis', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            }).then(r => r.json());
        }

        closeModal(elements.modalProfile);
        await loadBaseData();
        renderCurrentTab();
    } catch (err) {
        console.error('Error submitting profile:', err);
    }
}

// --- TASK EDIT POPUP / PROGRESS MODAL ---
window.openEditTaskModal = async function(taskId) {
    const task = state.tarefas.find(t => t.id === taskId);
    if (!task) return;

    document.getElementById('edit-task-id').value = task.id;
    document.getElementById('edit-task-title-display').textContent = task.titulo;
    document.getElementById('edit-task-status-select').value = task.status;

    // Clear new subtask title input
    const subtaskTitleInput = document.getElementById('new-subtask-title');
    if (subtaskTitleInput) {
        subtaskTitleInput.value = '';
    }

    // Set default assignee for new subtasks to the task's assignee
    const typeSelect = document.getElementById('new-subtask-colab-type');
    const companySelect = document.getElementById('new-subtask-company');
    if (typeSelect) typeSelect.value = 'Prodesp';
    if (companySelect) {
        companySelect.value = '';
        companySelect.style.display = 'none';
    }
    updateNewSubtaskAssigneeOptions(task.colaborador_id ? `prodesp-${task.colaborador_id}` : '');

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
                optionsHtml += '<optgroup label="Prodesp">';
                state.colaboradores.forEach(c => {
                    optionsHtml += `<option value="prodesp-${c.id}" ${c.id === s.colaborador_id ? 'selected' : ''}>${c.nome} (Prodesp)</option>`;
                });
                optionsHtml += '</optgroup>';

                state.empresas.forEach(emp => {
                    const compTercs = state.terceirizados.filter(t => t.empresa_id === emp.id);
                    if (compTercs.length > 0) {
                        optionsHtml += `<optgroup label="${emp.nome}">`;
                        compTercs.forEach(t => {
                            optionsHtml += `<option value="terceiro-${t.id}" ${t.id === s.colaborador_terceirizado_id ? 'selected' : ''}>${t.nome} (${t.cargo}) (${emp.nome})</option>`;
                        });
                        optionsHtml += '</optgroup>';
                    }
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
        
        // Reload current modal subtasks view safely if the modal is open
        const taskIdEl = document.getElementById('edit-task-id');
        const taskId = taskIdEl && taskIdEl.value ? parseInt(taskIdEl.value) : NaN;
        if (!isNaN(taskId)) {
            await loadAndRenderSubtasks(taskId);
        }
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

        let colabId = null;
        let colabTercId = null;
        if (collaboratorId) {
            if (collaboratorId.startsWith('prodesp-')) {
                colabId = parseInt(collaboratorId.replace('prodesp-', ''));
            } else if (collaboratorId.startsWith('terceiro-')) {
                colabTercId = parseInt(collaboratorId.replace('terceiro-', ''));
            }
        }

        await fetch(`/api/subtarefas/detalhes/${subtaskId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                titulo: sub.titulo,
                concluida: sub.concluida,
                colaborador_id: colabId,
                colaborador_terceirizado_id: colabTercId
            })
        });
        
        await loadAndRenderSubtasks(taskId);
    } catch (err) {
        console.error('Error updating subtask collaborator:', err);
    }
};

// Add subtask inline button action
document.getElementById('btn-add-subtask-action').addEventListener('click', async () => {
    try {
        const taskIdEl = document.getElementById('edit-task-id');
        if (!taskIdEl) throw new Error("Elemento 'edit-task-id' não encontrado.");
        
        const taskId = parseInt(taskIdEl.value);
        if (isNaN(taskId)) throw new Error("ID da tarefa inválido (NaN).");

        const titleInput = document.getElementById('new-subtask-title');
        if (!titleInput) throw new Error("Elemento 'new-subtask-title' não encontrado.");
        
        const title = titleInput.value.trim();
        if (!title) return;

        const assigneeSelect = document.getElementById('new-subtask-assignee');
        let colabId = null;
        let colabTercId = null;
        if (assigneeSelect && assigneeSelect.value) {
            const val = assigneeSelect.value;
            if (val.startsWith('prodesp-')) {
                colabId = parseInt(val.replace('prodesp-', ''));
            } else if (val.startsWith('terceiro-')) {
                colabTercId = parseInt(val.replace('terceiro-', ''));
            }
        }

        const response = await fetch('/api/subtarefas', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                tarefa_id: taskId,
                titulo: title,
                concluida: false,
                colaborador_id: colabId,
                colaborador_terceirizado_id: colabTercId
            })
        });

        if (!response.ok) {
            const errData = await response.json();
            throw new Error(errData.error || `Erro HTTP: ${response.status}`);
        }

        titleInput.value = '';
        await loadAndRenderSubtasks(taskId);
    } catch (err) {
        console.error('Error adding subtask:', err);
        alert('Erro ao adicionar sub-tarefa: ' + err.message);
    }
});

// Prevent form submission on enter inside subtask input and trigger add instead
document.getElementById('new-subtask-title').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
        e.preventDefault();
        document.getElementById('btn-add-subtask-action').click();
    }
});

// Update main task status and hours from form submit
async function handleEditTaskStatusSubmit(e) {
    e.preventDefault();
    const id = document.getElementById('edit-task-id').value;
    const payload = {
        status: document.getElementById('edit-task-status-select').value
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

    const projGerenciaSelect = document.getElementById('project-gerencia');
    if (projGerenciaSelect) {
        projGerenciaSelect.value = proj.gerencia_id || '';
    }
    
    updateProjectCoordinationDropdown(proj.gerencia_id, proj.coordenadoria_id);
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
    document.getElementById('coord-coordenador').value = coord.coordenador_id || '';

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
    document.getElementById('mgmt-responsavel').value = mgmt.responsavel_id || '';

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

// Edit requester helper
window.editRequester = function(reqId) {
    const req = state.solicitantes.find(s => s.id === reqId);
    if (!req) return;

    document.getElementById('requester-modal-title').textContent = "Editar Solicitante";
    document.getElementById('requester-id').value = req.id;
    document.getElementById('requester-name').value = req.nome;
    document.getElementById('requester-sector').value = req.setor;

    openModal(elements.modalRequester);
};

// Delete requester helper
window.deleteRequester = async function(reqId) {
    const req = state.solicitantes.find(s => s.id === reqId);
    if (!req) return;

    if (confirm(`Deseja realmente excluir o solicitante "${req.nome}"?\nNota: Ele será desvinculado de todas as tarefas associadas.`)) {
        try {
            const res = await fetch(`/api/solicitantes/${reqId}`, {
                method: 'DELETE'
            }).then(r => r.json());

            if (res.error) {
                alert('Erro ao excluir solicitante: ' + res.error);
            } else {
                await loadBaseData();
                renderCurrentTab();
            }
        } catch (err) {
            console.error('Error deleting requester:', err);
            alert('Erro de conexão ao tentar excluir o solicitante.');
        }
    }
};

// Edit profile helper
window.editProfile = function(profileId) {
    const prof = state.perfis.find(p => p.id === profileId);
    if (!prof) return;

    document.getElementById('profile-modal-title').textContent = "Editar Perfil";
    document.getElementById('profile-id').value = prof.id;
    document.getElementById('profile-name').value = prof.nome;

    currentProfileLinkedColabs = [...(prof.colaborador_ids || [])];
    document.getElementById('profile-colab-cpf').value = '';
    populateProfileColabDropdown();
    renderProfileLinkedColabs();
    populateProfileFunctionalitiesList(prof.funcionalidade_ids || []);

    openModal(elements.modalProfile);
};

// Delete profile helper
window.deleteProfile = async function(profileId) {
    const prof = state.perfis.find(p => p.id === profileId);
    if (!prof) return;

    if (confirm(`Deseja realmente excluir o perfil "${prof.nome}"?`)) {
        try {
            const res = await fetch(`/api/perfis/${profileId}`, {
                method: 'DELETE'
            }).then(r => r.json());

            if (res.error) {
                alert('Erro ao excluir perfil: ' + res.error);
            } else {
                await loadBaseData();
                renderCurrentTab();
            }
        } catch (err) {
            console.error('Error deleting profile:', err);
            alert('Erro de conexão ao tentar excluir o perfil.');
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
    
    // Set gerencia and update coordinate options before setting coordinate value
    const colabGerenciaSelect = document.getElementById('colab-gerencia');
    if (colabGerenciaSelect) {
        colabGerenciaSelect.value = colab.gerencia_id || '';
    }
    updateColabCoordinationDropdown(colab.gerencia_id, colab.coordenadoria_id);
    
    document.getElementById('colab-cpf').value = colab.cpf || '';
    document.getElementById('colab-password').value = colab.senha || '';

    // Check profiles checkboxes
    const profileCheckboxes = document.querySelectorAll('input[name="colab-profiles"]');
    profileCheckboxes.forEach(cb => {
        cb.checked = colab.perfil_ids && colab.perfil_ids.includes(parseInt(cb.value));
    });

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
            const response = await fetch(`/api/tarefas/${taskId}`, {
                method: 'DELETE'
            });
            if (!response.ok) {
                const errData = await response.json();
                alert(errData.error || 'Erro ao tentar excluir a tarefa.');
                return;
            }
            closeModal(elements.modalEditTaskStatus);
            await loadBaseData();
            renderCurrentTab();
        } catch (err) {
            console.error('Error deleting task:', err);
            alert('Erro de conexão ao tentar excluir a tarefa.');
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
    document.getElementById('task-requester').value = task.solicitante_id || '';
    
    // Format delivery date (YYYY-MM-DD)
    if (task.data_entrega) {
        const dateStr = new Date(task.data_entrega).toISOString().split('T')[0];
        document.getElementById('task-deadline').value = dateStr;
    } else {
        document.getElementById('task-deadline').value = '';
    }
    
    // Update task coordinator display
    updateTaskCoordinatorDisplay(task.colaborador_id);

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
            const response = await fetch(`/api/subtarefas/${subtaskId}`, {
                method: 'DELETE'
            });
            if (!response.ok) {
                const errData = await response.json();
                alert(errData.error || 'Erro ao tentar excluir a sub-tarefa.');
                return;
            }
            const taskId = parseInt(document.getElementById('edit-task-id').value);
            await loadAndRenderSubtasks(taskId);
        } catch (err) {
            console.error('Error deleting subtask:', err);
            alert('Erro de conexão ao tentar excluir a sub-tarefa.');
        }
    }
};

// --- 6. APONTAMENTOS TAB RENDERING & HANDLING ---
function renderApontamentosTab() {
    const searchVal = elements.apontamentoSearch.value.toLowerCase();
    
    let list = state.apontamentos;
    const currentColab = state.currentUser ? state.colaboradores.find(c => c.id == state.currentUser.id) : null;
    const perfilIds = currentColab ? (currentColab.perfil_ids || []) : [];
    const userProfiles = state.perfis.filter(p => perfilIds.includes(p.id)).map(p => p.nome);

    const isApontador = userProfiles.includes('Apontador');
    const isHigher = userProfiles.includes('Administrador') || userProfiles.includes('Gerência') || userProfiles.includes('Coordenador');
    
    if (isApontador && !isHigher) {
        list = list.filter(a => a.colaborador_id == state.currentUser.id);
    }

    // Filter by selected period
    const periodFilter = elements.apontamentoPeriodFilter;
    const periodId = periodFilter ? periodFilter.value : null;
    if (periodId) {
        const period = state.mesesFechamento.find(p => p.id == periodId);
        if (period) {
            const pStart = typeof period.data_inicio === 'object' ? period.data_inicio.toISOString().split('T')[0] : String(period.data_inicio).split('T')[0];
            const pEnd = typeof period.data_fim === 'object' ? period.data_fim.toISOString().split('T')[0] : String(period.data_fim).split('T')[0];
            
            list = list.filter(a => {
                const aDate = typeof a.data_apontamento === 'object' ? a.data_apontamento.toISOString().split('T')[0] : String(a.data_apontamento).split('T')[0];
                return aDate >= pStart && aDate <= pEnd;
            });
        }
    }
    
    const filteredApontamentos = list.filter(a => 
        (a.colaborador_nome && a.colaborador_nome.toLowerCase().includes(searchVal)) || 
        (a.projeto_nome && a.projeto_nome.toLowerCase().includes(searchVal)) ||
        (a.tarefa_titulo && a.tarefa_titulo.toLowerCase().includes(searchVal)) ||
        (a.subtarefa_titulo && a.subtarefa_titulo.toLowerCase().includes(searchVal)) ||
        (a.descricao && a.descricao.toLowerCase().includes(searchVal))
    );

    let html = '';

    if (filteredApontamentos.length === 0) {
        html = `
            <tr>
                <td colspan="8" style="text-align: center; color: var(--text-muted); padding: 30px;">
                    Nenhum apontamento registrado ainda.
                </td>
            </tr>
        `;
    } else {
        filteredApontamentos.forEach(a => {
            const dateStr = formatDate(a.data_apontamento);
            const horasStr = a.horas !== null && a.horas !== undefined ? `${a.horas}h` : '-';
            html += `
                <tr ondblclick="editApontamento(${a.id})" style="cursor: pointer;" title="Duplo clique para editar">
                    <td style="color: var(--text-secondary);">${dateStr}</td>
                    <td style="font-weight: 600;">${a.colaborador_nome}</td>
                    <td><span class="project-coord-badge">${a.projeto_nome}</span></td>
                    <td>${a.tarefa_titulo}</td>
                    <td><span style="color: var(--text-muted);">${a.subtarefa_titulo || 'Atividade Geral'}</span></td>
                    <td style="font-weight: 600; color: var(--accent-blue);">${horasStr}</td>
                    <td style="max-width: 250px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${a.descricao}">${a.descricao}</td>
                    <td style="text-align: right; white-space: nowrap;">
                        <button class="btn btn-secondary btn-sm" onclick="editApontamento(${a.id})" style="padding: 4px 8px; margin-right: 4px;" title="Editar Apontamento">
                            <i class="fa-solid fa-pen" style="font-size: 11px;"></i>
                        </button>
                        <button class="btn btn-danger btn-sm" onclick="deleteApontamento(${a.id})" style="padding: 4px 8px;" title="Excluir Apontamento">
                            <i class="fa-solid fa-trash" style="font-size: 11px;"></i>
                        </button>
                    </td>
                </tr>
            `;
        });
    }
    elements.apontamentosList.innerHTML = html;

    // Calculate total hours per collaborator
    const colabTotals = {};
    filteredApontamentos.forEach(a => {
        const id = a.colaborador_id;
        const name = a.colaborador_nome || 'Sem Nome';
        const hours = a.horas !== null && a.horas !== undefined ? parseFloat(a.horas) : 0;
        if (!colabTotals[id]) {
            const colabObj = state.colaboradores.find(c => c.id == id);
            const sector = colabObj ? (colabObj.coordenadoria_sigla || 'Sem Setor') : 'N/A';
            colabTotals[id] = { id, name, sector, hours: 0 };
        }
        colabTotals[id].hours += hours;
    });

    // Sort alphabetically by collaborator name
    const sortedColabs = Object.values(colabTotals).sort((a, b) => a.name.localeCompare(b.name));

    // Render totals table
    let totalsHtml = '';
    if (sortedColabs.length === 0) {
        totalsHtml = `
            <tr>
                <td colspan="3" style="text-align: center; color: var(--text-muted); padding: 20px;">
                    Nenhum colaborador com horas registradas neste período.
                </td>
            </tr>
        `;
    } else {
        sortedColabs.forEach(item => {
            totalsHtml += `
                <tr onclick="generateCollaboratorPDF(${item.id}, '${periodId || ''}')" style="cursor: pointer;" title="Clique para gerar PDF de apontamentos deste colaborador">
                    <td style="font-weight: 600; color: var(--primary-hover);">${item.name} <i class="fa-solid fa-file-pdf" style="margin-left: 5px; font-size: 11.5px; opacity: 0.8;"></i></td>
                    <td><span class="project-coord-badge">${item.sector}</span></td>
                    <td style="font-weight: 600; color: var(--accent-blue);">${item.hours.toFixed(1)}h</td>
                </tr>
            `;
        });
    }
    const colabTotalsListEl = document.getElementById('apontamentos-colab-totals-list');
    if (colabTotalsListEl) {
        colabTotalsListEl.innerHTML = totalsHtml;
    }
}

async function handleApontamentoSubmit(e) {
    e.preventDefault();
    const id = document.getElementById('apontamento-id').value;
    const payload = {
        colaborador_id: parseInt(document.getElementById('apontamento-collaborator').value),
        data_apontamento: document.getElementById('apontamento-date').value,
        projeto_id: parseInt(document.getElementById('apontamento-project').value),
        horas: document.getElementById('apontamento-hours').value ? parseFloat(document.getElementById('apontamento-hours').value) : null,
        tarefa_id: parseInt(document.getElementById('apontamento-task').value),
        subtarefa_id: document.getElementById('apontamento-subtask').value ? parseInt(document.getElementById('apontamento-subtask').value) : null,
        descricao: document.getElementById('apontamento-desc').value.trim()
    };

    try {
        const url = id ? `/api/apontamentos/${id}` : '/api/apontamentos';
        const method = id ? 'PUT' : 'POST';
        const response = await fetch(url, {
            method: method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            throw new Error(`HTTP error: ${response.status}`);
        }

        closeModal(elements.modalApontamento);
        await loadBaseData();
        renderCurrentTab();
    } catch (err) {
        console.error('Error submitting apontamento:', err);
        alert('Erro ao registrar apontamento: ' + err.message);
    }
}

window.deleteApontamento = async function(id) {
    if (confirm('Deseja realmente excluir este lançamento de apontamento?')) {
        try {
            const response = await fetch(`/api/apontamentos/${id}`, {
                method: 'DELETE'
            });

            if (!response.ok) {
                throw new Error(`HTTP error: ${response.status}`);
            }

            await loadBaseData();
            renderCurrentTab();
        } catch (err) {
            console.error('Error deleting apontamento:', err);
            alert('Erro ao excluir apontamento: ' + err.message);
        }
    }
};

window.editApontamento = async function(id) {
    const a = state.apontamentos.find(item => item.id == id);
    if (!a) return;

    // Set title and ID in modal
    document.getElementById('apontamento-modal-title').textContent = "Editar Apontamento";
    document.getElementById('apontamento-id').value = a.id;

    // Populate collaborator and toggle disabled depending on permissions
    const colabSelect = document.getElementById('apontamento-collaborator');
    if (colabSelect) {
        colabSelect.value = a.colaborador_id;
        const profiles = state.currentUser ? (state.currentUser.profiles || []) : [];
        const isApontador = profiles.includes('Apontador');
        const isHigher = profiles.includes('Administrador') || profiles.includes('Gerência') || profiles.includes('Coordenador');
        if (isApontador && !isHigher) {
            colabSelect.disabled = true;
        } else {
            colabSelect.disabled = false;
        }
    }

    // Load project list for this collaborator
    const colabIdInt = parseInt(a.colaborador_id);
    const associatedProjectIds = new Set();
    state.tarefas.forEach(t => {
        if (t.colaborador_id === colabIdInt) {
            associatedProjectIds.add(t.projeto_id);
        }
        if (t.subtasks && Array.isArray(t.subtasks)) {
            t.subtasks.forEach(s => {
                if (s.colaborador_id === colabIdInt) {
                    associatedProjectIds.add(t.projeto_id);
                }
            });
        }
    });

    const colabProjects = state.projetos.filter(p => associatedProjectIds.has(p.id));
    const projectSelect = document.getElementById('apontamento-project');
    
    let projHtml = '<option value="" disabled>Escolha o projeto...</option>';
    colabProjects.forEach(p => {
        projHtml += `<option value="${p.id}">${p.nome}</option>`;
    });
    projectSelect.innerHTML = projHtml;
    projectSelect.disabled = false;
    projectSelect.value = a.projeto_id;

    // Load tasks for selected project and collaborator
    const projectTasks = state.tarefas.filter(t => 
        t.projeto_id == a.projeto_id && 
        (t.colaborador_id === colabIdInt || (t.subtasks && t.subtasks.some(s => s.colaborador_id === colabIdInt)))
    );

    const taskSelect = document.getElementById('apontamento-task');
    let taskHtml = '<option value="" disabled>Escolha uma tarefa...</option>';
    projectTasks.forEach(t => {
        taskHtml += `<option value="${t.id}">${t.titulo}</option>`;
    });
    taskSelect.innerHTML = taskHtml;
    taskSelect.disabled = false;
    taskSelect.value = a.tarefa_id;

    // Load subtasks for selected task and collaborator
    const subtaskSelect = document.getElementById('apontamento-subtask');
    const task = state.tarefas.find(t => t.id == a.tarefa_id);
    let subtaskHtml = '<option value="">Nenhuma (Opcional)</option>';
    
    if (task && task.subtasks && task.subtasks.length > 0) {
        const filteredSubtasks = task.subtasks.filter(s => 
            s.colaborador_id === colabIdInt || task.colaborador_id === colabIdInt
        );
        filteredSubtasks.forEach(s => {
            subtaskHtml += `<option value="${s.id}">${s.titulo}</option>`;
        });
        subtaskSelect.innerHTML = subtaskHtml;
        subtaskSelect.disabled = false;
        subtaskSelect.value = a.subtarefa_id || '';
    } else {
        subtaskSelect.innerHTML = '<option value="">Nenhuma sub-tarefa disponível</option>';
        subtaskSelect.disabled = true;
        subtaskSelect.value = '';
    }

    // Populate date, hours and description
    const rawDate = a.data_apontamento;
    const dateStr = typeof rawDate === 'object' ? rawDate.toISOString().split('T')[0] : String(rawDate).split('T')[0];
    document.getElementById('apontamento-date').value = dateStr;
    document.getElementById('apontamento-hours').value = a.horas !== null && a.horas !== undefined ? a.horas : '';
    document.getElementById('apontamento-desc').value = a.descricao || '';

    // Show the modal
    openModal(elements.modalApontamento);
};

// --- PERIOD MANAGEMENT FUNCTIONS ---
async function openManageFechamentosModal() {
    renderFechamentosModalList();
    openModal(elements.modalManageFechamentos);
}

function renderFechamentosModalList() {
    const listEl = elements.fechamentosListTable;
    listEl.innerHTML = '';

    if (state.mesesFechamento.length === 0) {
        listEl.innerHTML = '<tr><td colspan="5" style="text-align: center; color: var(--text-muted); padding: 20px;">Nenhum período cadastrado.</td></tr>';
    } else {
        state.mesesFechamento.forEach(f => {
            const row = document.createElement('tr');
            const startStr = formatDate(f.data_inicio);
            const endStr = formatDate(f.data_fim);
            row.innerHTML = `
                <td style="text-align: center;">
                    <input type="checkbox" ${f.ativo ? 'checked' : ''} onchange="toggleAtivoFechamento(${f.id}, this.checked)" style="cursor: pointer; width: 16px; height: 16px; accent-color: var(--primary);">
                </td>
                <td style="font-weight: 600;">${f.descricao}</td>
                <td>${startStr}</td>
                <td>${endStr}</td>
                <td style="text-align: right;">
                    <button type="button" class="btn btn-danger btn-sm" onclick="deleteFechamento(${f.id})" style="padding: 4px 8px;">
                        <i class="fa-solid fa-trash" style="font-size: 11px;"></i>
                    </button>
                </td>
            `;
            listEl.appendChild(row);
        });
    }
}

window.toggleAtivoFechamento = async function(id, isChecked) {
    if (!isChecked) {
        renderFechamentosModalList();
        return;
    }
    try {
        const response = await fetch(`/api/meses-fechamento/${id}/ativar`, {
            method: 'PUT'
        });
        if (!response.ok) throw new Error('Falha ao ativar período.');
        
        await loadBaseData();
        
        const activePeriod = state.mesesFechamento.find(f => f.ativo);
        if (activePeriod) {
            if (elements.reportFechamento) elements.reportFechamento.value = activePeriod.id;
            if (elements.apontamentoPeriodFilter) elements.apontamentoPeriodFilter.value = activePeriod.id;
        }
        
        renderFechamentosModalList();
        populateDropdowns();
        renderCurrentTab();
    } catch (err) {
        console.error(err);
        alert('Erro ao ativar período: ' + err.message);
        renderFechamentosModalList();
    }
};

async function handleFechamentoSubmit(e) {
    e.preventDefault();
    const payload = {
        descricao: document.getElementById('fechamento-desc').value.trim(),
        data_inicio: document.getElementById('fechamento-start').value,
        data_fim: document.getElementById('fechamento-end').value
    };

    try {
        const res = await fetch('/api/meses-fechamento', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        }).then(r => r.json());

        if (res.error) {
            alert('Erro ao cadastrar período: ' + res.error);
            return;
        }

        // Reset form
        elements.formFechamento.reset();
        
        // Reload base data
        await loadBaseData();
        
        // Rerender modal list
        renderFechamentosModalList();
        
        // Update dropdowns
        populateDropdowns();
        
        // Rerender report if currently on report tab
        renderCurrentTab();
    } catch (err) {
        console.error('Error submitting period:', err);
    }
}

window.deleteFechamento = async function(id) {
    if (confirm('Deseja realmente excluir este período de fechamento?')) {
        try {
            const res = await fetch(`/api/meses-fechamento/${id}`, {
                method: 'DELETE'
            }).then(r => r.json());

            if (res.error) {
                alert('Erro ao excluir período: ' + res.error);
                return;
            }

            // Reload base data
            await loadBaseData();
            
            // Rerender modal list
            renderFechamentosModalList();
            
            // Update dropdowns
            populateDropdowns();
            
            // Rerender report if currently on report tab
            renderCurrentTab();
        } catch (err) {
            console.error('Error deleting period:', err);
        }
    }
};

// --- GENERAL HELPERS ---
function formatDate(dateVal) {
    if (!dateVal) return '';
    try {
        const isoString = typeof dateVal === 'object' ? dateVal.toISOString() : String(dateVal);
        const datePart = isoString.split('T')[0];
        const parts = datePart.split('-');
        if (parts.length === 3) {
            const [year, month, day] = parts;
            return `${day}/${month}/${year}`;
        }
    } catch (e) {
        console.error('Error formatting date:', dateVal, e);
    }
    return String(dateVal);
}

// --- AUTHENTICATION & ACCESS CONTROL HELPERS ---

function showLoginScreen() {
    const loginScreen = document.getElementById('login-screen');
    if (loginScreen) {
        loginScreen.classList.add('active');
    }
}

function hideLoginScreen() {
    const loginScreen = document.getElementById('login-screen');
    if (loginScreen) {
        loginScreen.classList.remove('active');
    }
}

async function handleLoginSubmit(e) {
    if (e) e.preventDefault();
    const cpf = document.getElementById('login-cpf').value.trim();
    const senha = document.getElementById('login-password').value.trim();
    const errorMsg = document.getElementById('login-error-msg');
    
    if (errorMsg) errorMsg.style.display = 'none';
    
    try {
        const res = await fetch('/api/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ cpf, senha })
        });
        
        if (!res.ok) {
            const data = await res.json();
            throw new Error(data.error || 'Erro na autenticação.');
        }
        
        const user = await res.json();
        localStorage.setItem('currentUser', JSON.stringify(user));
        state.currentUser = user;
        
        hideLoginScreen();
        await initApp();
    } catch (err) {
        console.error('Login error:', err);
        if (errorMsg) {
            errorMsg.textContent = err.message;
            errorMsg.style.display = 'block';
        }
    }
}

window.handleLogout = function() {
    localStorage.removeItem('currentUser');
    state.currentUser = null;
    showLoginScreen();
    // Reset page view
    elements.menuItems.forEach(item => item.classList.remove('active'));
    document.getElementById('nav-dashboard').classList.add('active');
    state.currentTab = 'dashboard-tab';
    
    // Clear login inputs
    document.getElementById('login-cpf').value = '';
    document.getElementById('login-password').value = '';
    const errorMsg = document.getElementById('login-error-msg');
    if (errorMsg) errorMsg.style.display = 'none';
};

function updateLoggedInUserUI() {
    const nameEl = document.getElementById('current-user-name');
    const roleEl = document.getElementById('current-user-role');
    if (state.currentUser) {
        if (nameEl) nameEl.textContent = state.currentUser.nome;
        if (roleEl) {
            const profilesStr = state.currentUser.profiles && state.currentUser.profiles.length > 0 
                ? state.currentUser.profiles.join(', ') 
                : state.currentUser.cargo;
            roleEl.textContent = profilesStr;
        }
    }
}

function applySecurityPermissions() {
    const allowed = state.currentUser ? (state.currentUser.functionalities || []) : [];
    
    const menuSecurityMap = {
        'nav-dashboard': 'painel-geral',
        'nav-projects': 'projetos',
        'nav-tasks': 'tarefas',
        'nav-team': 'equipes',
        'nav-requesters': 'solicitantes',
        'nav-profiles': 'perfis',
        'nav-functionalities': 'funcionalidades',
        'nav-closing': 'fechamento-mensal',
        'nav-manage-periods': 'gerenciar-periodos',
        'nav-apontamentos': 'apontamentos',
        'nav-partners': 'empresas'
    };
    
    // Hide/show menu links
    for (const [id, requiredPerm] of Object.entries(menuSecurityMap)) {
        const el = document.getElementById(id);
        if (el) {
            if (allowed.includes(requiredPerm)) {
                el.style.display = '';
            } else {
                el.style.display = 'none';
            }
        }
    }
    
    // Dynamic page element hiding based on permissions
    const addProjectBtn = document.getElementById('btn-dashboard-add-project');
    if (addProjectBtn) {
        addProjectBtn.style.display = allowed.includes('projetos') ? '' : 'none';
    }
    
    const manageFechamentosBtn = document.getElementById('btn-manage-fechamentos');
    if (manageFechamentosBtn) {
        manageFechamentosBtn.style.display = allowed.includes('gerenciar-periodos') ? '' : 'none';
    }
}

// --- FUNCTIONALITIES CRUD HELPERS ---

function renderFunctionalitiesTab() {
    const tbody = document.getElementById('functionalities-list');
    if (!tbody) return;
    
    let html = '';
    if (state.funcionalidades.length === 0) {
        html = '<tr><td colspan="3" style="text-align: center; color: var(--text-muted);">Nenhuma funcionalidade cadastrada.</td></tr>';
    } else {
        state.funcionalidades.forEach(f => {
            html += `
                <tr ondblclick="editFunctionality(${f.id})" style="cursor: pointer;" title="Duplo clique para editar">
                    <td style="font-family: monospace; font-size: 11.5px; font-weight: 600; color: #818cf8;">${f.chave}</td>
                    <td>${f.nome}</td>
                    <td style="text-align: right;">
                        <button class="btn btn-secondary btn-sm" onclick="editFunctionality(${f.id})" style="padding: 4px 8px; margin-right: 4px;">
                            <i class="fa-solid fa-pen" style="font-size: 11px;"></i>
                        </button>
                        <button class="btn btn-danger btn-sm" onclick="deleteFunctionality(${f.id})" style="padding: 4px 8px;">
                            <i class="fa-solid fa-trash" style="font-size: 11px;"></i>
                        </button>
                    </td>
                </tr>
            `;
        });
    }
    tbody.innerHTML = html;
}

window.editFunctionality = function(id) {
    const func = state.funcionalidades.find(f => f.id === id);
    if (!func) return;
    
    document.getElementById('functionality-modal-title').textContent = "Editar Funcionalidade";
    document.getElementById('functionality-id').value = func.id;
    document.getElementById('functionality-key').value = func.chave;
    document.getElementById('functionality-name').value = func.nome;
    
    // Disable key edit for default seeded permissions to protect mapping
    const defaults = ['projetos', 'tarefas', 'equipes', 'solicitantes', 'perfis', 'fechamento-mensal', 'gerenciar-periodos', 'apontamentos'];
    document.getElementById('functionality-key').disabled = defaults.includes(func.chave);
    
    openModal(document.getElementById('modal-functionality'));
};

window.deleteFunctionality = async function(id) {
    const func = state.funcionalidades.find(f => f.id === id);
    if (!func) return;
    
    const defaults = ['projetos', 'tarefas', 'equipes', 'solicitantes', 'perfis', 'fechamento-mensal', 'gerenciar-periodos', 'apontamentos'];
    if (defaults.includes(func.chave)) {
        alert('As funcionalidades padrão do sistema não podem ser removidas.');
        return;
    }
    
    if (confirm(`Deseja realmente excluir a funcionalidade "${func.nome}"?`)) {
        try {
            const res = await fetch(`/api/funcionalidades/${id}`, {
                method: 'DELETE'
            }).then(r => r.json());
            
            if (res.error) {
                alert('Erro ao excluir: ' + res.error);
            } else {
                await loadBaseData();
                renderCurrentTab();
            }
        } catch (err) {
            console.error('Error deleting functionality:', err);
        }
    }
};

async function handleFunctionalitySubmit(e) {
    e.preventDefault();
    const id = document.getElementById('functionality-id').value;
    const payload = {
        chave: document.getElementById('functionality-key').value.trim(),
        nome: document.getElementById('functionality-name').value.trim()
    };
    
    try {
        let res;
        if (id) {
            res = await fetch(`/api/funcionalidades/${id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            }).then(r => r.json());
        } else {
            res = await fetch('/api/funcionalidades', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            }).then(r => r.json());
        }
        
        closeModal(document.getElementById('modal-functionality'));
        await loadBaseData();
        renderCurrentTab();
    } catch (err) {
        console.error('Error saving functionality:', err);
    }
}

function populateProfileFunctionalitiesList(checkedIds = []) {
    const container = document.getElementById('profile-functionalities-list');
    if (!container) return;
    
    let html = '';
    state.funcionalidades.forEach(f => {
        const isChecked = checkedIds.includes(f.id) ? 'checked' : '';
        html += `
            <label class="func-item" data-chave="${f.chave.toLowerCase()}" data-nome="${f.nome.toLowerCase()}">
                <div class="func-info">
                    <span class="func-key">${f.chave}</span>
                    <span class="func-name">${f.nome}</span>
                </div>
                <input type="checkbox" value="${f.id}" ${isChecked}>
            </label>
        `;
    });
    container.innerHTML = html;

    // Reset the search filter input
    const searchInput = document.getElementById('profile-func-search');
    if (searchInput) searchInput.value = '';
}

function setupDatePickerListeners() {
    document.querySelectorAll('input[type="date"]').forEach(input => {
        input.addEventListener('click', () => {
            try {
                if (typeof input.showPicker === 'function') {
                    input.showPicker();
                }
            } catch (e) {
                console.error('showPicker failed', e);
            }
        });
    });
}

// --- PARTNER COMPANIES & OUTSOURCED COLLABORATORS CRUD ---

// Render Tab
function renderPartnersTab() {
    renderCompaniesList();
    renderPartnerDetail();
}

// Render Left Column: Companies List
function renderCompaniesList() {
    const listEl = document.getElementById('companies-list');
    if (!listEl) return;
    listEl.innerHTML = '';

    if (state.empresas.length === 0) {
        listEl.innerHTML = `
            <div style="text-align: center; color: var(--text-muted); padding: 20px;">
                Nenhuma empresa cadastrada.
            </div>
        `;
        return;
    }

    state.empresas.forEach(emp => {
        const isActive = state.selectedEmpresaId == emp.id ? 'active' : '';
        const card = document.createElement('div');
        card.className = `partner-card ${isActive}`;
        card.innerHTML = `
            <div class="partner-card-title">${emp.nome}</div>
            <div class="partner-card-cnpj">CNPJ: ${emp.cnpj}</div>
            <div class="partner-card-terceirizados-count">
                <i class="fa-solid fa-users"></i> ${emp.total_terceirizados || 0} Terceirizados
            </div>
        `;
        card.addEventListener('click', () => {
            state.selectedEmpresaId = emp.id;
            renderPartnersTab();
        });
        listEl.appendChild(card);
    });
}

// Render Right Column: Selected Company Detail
async function renderPartnerDetail() {
    const emptyEl = document.getElementById('partner-detail-empty');
    const contentEl = document.getElementById('partner-detail-content');
    if (!emptyEl || !contentEl) return;

    if (!state.selectedEmpresaId) {
        emptyEl.style.display = 'flex';
        contentEl.style.display = 'none';
        return;
    }

    const company = state.empresas.find(e => e.id == state.selectedEmpresaId);
    if (!company) {
        state.selectedEmpresaId = null;
        emptyEl.style.display = 'flex';
        contentEl.style.display = 'none';
        return;
    }

    // Populate company header details
    emptyEl.style.display = 'none';
    contentEl.style.display = 'block';
    document.getElementById('detail-partner-name').textContent = company.nome;
    document.getElementById('detail-partner-cnpj').textContent = company.cnpj;

    // Load outsourced collaborators for this company
    const listTableEl = document.getElementById('terceirizados-list');
    if (!listTableEl) return;
    listTableEl.innerHTML = `
        <tr>
            <td colspan="5" style="text-align: center; color: var(--text-muted);">Carregando terceirizados...</td>
        </tr>
    `;

    try {
        const response = await fetch(`/api/empresas/${company.id}/terceirizados`);
        state.terceirizados = await response.json();
        
        listTableEl.innerHTML = '';
        if (state.terceirizados.length === 0) {
            listTableEl.innerHTML = `
                <tr>
                    <td colspan="5" style="text-align: center; color: var(--text-muted);">
                        Nenhum colaborador terceirizado cadastrado para esta empresa.
                    </td>
                </tr>
            `;
            return;
        }

        state.terceirizados.forEach(t => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td><strong>${t.nome}</strong></td>
                <td>${t.cpf}</td>
                <td>${t.email}</td>
                <td><span class="badge badge-todo">${t.cargo}</span></td>
                <td style="text-align: right;">
                    <div style="display: flex; gap: 6px; justify-content: flex-end;">
                        <button class="btn btn-secondary btn-sm edit-terc-btn" data-id="${t.id}" title="Editar">
                            <i class="fa-solid fa-pen"></i>
                        </button>
                        <button class="btn btn-danger btn-sm delete-terc-btn" data-id="${t.id}" title="Excluir">
                            <i class="fa-solid fa-trash"></i>
                        </button>
                    </div>
                </td>
            `;

            // Wire action buttons
            tr.querySelector('.edit-terc-btn').addEventListener('click', () => openOutsourcedModal(t));
            tr.querySelector('.delete-terc-btn').addEventListener('click', () => deleteOutsourced(t.id));

            listTableEl.appendChild(tr);
        });
    } catch (err) {
        console.error('Error rendering terceirizados list:', err);
        listTableEl.innerHTML = `
            <tr>
                <td colspan="5" style="text-align: center; color: var(--accent-red);">Erro ao carregar terceirizados.</td>
            </tr>
        `;
    }
}

// Modal Partner Company Helpers
function openPartnerModal(company = null) {
    const modal = document.getElementById('modal-partner');
    const title = document.getElementById('partner-modal-title');
    const form = document.getElementById('form-partner');
    if (!modal || !form) return;

    form.reset();
    if (company) {
        title.textContent = 'Editar Empresa Parceira';
        document.getElementById('partner-id').value = company.id;
        document.getElementById('partner-name').value = company.nome;
        document.getElementById('partner-cnpj').value = company.cnpj;
    } else {
        title.textContent = 'Registrar Empresa Parceira';
        document.getElementById('partner-id').value = '';
    }
    openModal(modal);
}

async function handleSavePartner(e) {
    e.preventDefault();
    const id = document.getElementById('partner-id').value;
    const nome = document.getElementById('partner-name').value;
    const cnpj = document.getElementById('partner-cnpj').value;

    const payload = { nome, cnpj };
    const url = id ? `/api/empresas/${id}` : '/api/empresas';
    const method = id ? 'PUT' : 'POST';

    try {
        const response = await fetch(url, {
            method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            const errData = await response.json();
            alert(errData.error || 'Erro ao salvar empresa parceira.');
            return;
        }

        closeModal(document.getElementById('modal-partner'));
        await loadBaseData();
        if (!id && state.empresas.length > 0) {
            const newCompany = state.empresas.find(emp => emp.cnpj === cnpj);
            if (newCompany) state.selectedEmpresaId = newCompany.id;
        }
        renderPartnersTab();
    } catch (err) {
        console.error('Error saving company:', err);
    }
}

async function deletePartner() {
    if (!state.selectedEmpresaId) return;
    const company = state.empresas.find(e => e.id == state.selectedEmpresaId);
    if (!company) return;

    if (!confirm(`Tem certeza de que deseja excluir a empresa "${company.nome}"? Isso excluirá todos os colaboradores terceirizados vinculados a ela.`)) {
        return;
    }

    try {
        const response = await fetch(`/api/empresas/${company.id}`, { method: 'DELETE' });
        if (response.ok) {
            state.selectedEmpresaId = null;
            await loadBaseData();
            renderPartnersTab();
        } else {
            alert('Erro ao excluir empresa parceira.');
        }
    } catch (err) {
        console.error('Error deleting company:', err);
    }
}

// Modal Outsourced Collaborator Helpers
function openOutsourcedModal(terceirizado = null) {
    const modal = document.getElementById('modal-outsourced');
    const title = document.getElementById('outsourced-modal-title');
    const form = document.getElementById('form-outsourced');
    if (!modal || !form) return;

    form.reset();
    document.getElementById('outsourced-partner-id').value = state.selectedEmpresaId;
    if (terceirizado) {
        title.textContent = 'Editar Colaborador Terceirizado';
        document.getElementById('outsourced-id').value = terceirizado.id;
        document.getElementById('outsourced-name').value = terceirizado.nome;
        document.getElementById('outsourced-cpf').value = terceirizado.cpf;
        document.getElementById('outsourced-email').value = terceirizado.email;
        document.getElementById('outsourced-cargo').value = terceirizado.cargo;
    } else {
        title.textContent = 'Registrar Colaborador Terceirizado';
        document.getElementById('outsourced-id').value = '';
    }
    openModal(modal);
}

async function handleSaveOutsourced(e) {
    e.preventDefault();
    const id = document.getElementById('outsourced-id').value;
    const empresaId = document.getElementById('outsourced-partner-id').value;
    const nome = document.getElementById('outsourced-name').value;
    const cpf = document.getElementById('outsourced-cpf').value;
    const email = document.getElementById('outsourced-email').value;
    const cargo = document.getElementById('outsourced-cargo').value;

    const payload = { nome, cpf, email, cargo };
    const url = id ? `/api/terceirizados/${id}` : `/api/empresas/${empresaId}/terceirizados`;
    const method = id ? 'PUT' : 'POST';

    try {
        const response = await fetch(url, {
            method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            const errData = await response.json();
            alert(errData.error || 'Erro ao salvar colaborador terceirizado.');
            return;
        }

        closeModal(document.getElementById('modal-outsourced'));
        await loadBaseData(); 
        renderPartnersTab();
    } catch (err) {
        console.error('Error saving outsourced:', err);
    }
}

async function deleteOutsourced(id) {
    const terceirizado = state.terceirizados.find(t => t.id == id);
    if (!terceirizado) return;

    if (!confirm(`Tem certeza de que deseja excluir o colaborador terceirizado "${terceirizado.nome}"?`)) {
        return;
    }

    try {
        const response = await fetch(`/api/terceirizados/${id}`, { method: 'DELETE' });
        if (response.ok) {
            await loadBaseData(); 
            renderPartnersTab();
        } else {
            alert('Erro ao excluir colaborador terceirizado.');
        }
    } catch (err) {
        console.error('Error deleting outsourced:', err);
    }
}

// Input mask functions
function maskCNPJ(el) {
    let val = el.value.replace(/\D/g, "");
    if (val.length > 14) val = val.substring(0, 14);
    
    let formatted = val;
    if (val.length > 2) {
        formatted = val.substring(0, 2) + "." + val.substring(2);
    }
    if (val.length > 5) {
        formatted = formatted.substring(0, 6) + "." + formatted.substring(6);
    }
    if (val.length > 8) {
        formatted = formatted.substring(0, 10) + "/" + formatted.substring(10);
    }
    if (val.length > 12) {
        formatted = formatted.substring(0, 15) + "-" + formatted.substring(15);
    }
    el.value = formatted;
}

function maskCPF(el) {
    let val = el.value.replace(/\D/g, "");
    if (val.length > 11) val = val.substring(0, 11);
    
    let formatted = val;
    if (val.length > 3) {
        formatted = val.substring(0, 3) + "." + val.substring(3);
    }
    if (val.length > 6) {
        formatted = formatted.substring(0, 7) + "." + formatted.substring(7);
    }
    if (val.length > 9) {
        formatted = formatted.substring(0, 11) + "-" + formatted.substring(11);
    }
    el.value = formatted;
}

// Update assignee options based on colab type and company
function updateNewSubtaskAssigneeOptions(defaultSelectedVal = '') {
    const typeSelect = document.getElementById('new-subtask-colab-type');
    const companySelect = document.getElementById('new-subtask-company');
    const assigneeSelect = document.getElementById('new-subtask-assignee');
    if (!typeSelect || !companySelect || !assigneeSelect) return;

    const type = typeSelect.value;
    let html = '<option value="">Sem Colaborador</option>';

    if (type === 'Prodesp') {
        companySelect.style.display = 'none';
        state.colaboradores.forEach(c => {
            const val = `prodesp-${c.id}`;
            const isSelected = val === defaultSelectedVal ? 'selected' : '';
            html += `<option value="${val}" ${isSelected}>${c.nome} (Prodesp)</option>`;
        });
    } else {
        companySelect.style.display = 'inline-block';
        
        // Populate companies dropdown if it only has "Selecione..." option
        if (companySelect.options.length <= 1) {
            let compHtml = '<option value="">Selecione...</option>';
            state.empresas.forEach(emp => {
                compHtml += `<option value="${emp.id}">${emp.nome}</option>`;
            });
            companySelect.innerHTML = compHtml;
        }

        const selectedCompanyId = companySelect.value;
        if (selectedCompanyId) {
            const companyObj = state.empresas.find(e => e.id == selectedCompanyId);
            const companyName = companyObj ? companyObj.nome : '';
            const filtered = state.terceirizados.filter(t => t.empresa_id == selectedCompanyId);
            filtered.forEach(t => {
                const val = `terceiro-${t.id}`;
                const isSelected = val === defaultSelectedVal ? 'selected' : '';
                html += `<option value="${val}" ${isSelected}>${t.nome} (${t.cargo}) (${companyName})</option>`;
            });
        } else {
            html += '<option value="" disabled>Escolha uma empresa parceira...</option>';
        }
    }

    assigneeSelect.innerHTML = html;
}


