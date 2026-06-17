const express = require('express');
const sql = require('mssql');
const path = require('path');
const { execSync } = require('child_process');
require('dotenv').config();

// Load system version
const pjson = require('./package.json');
const systemVersion = pjson.version;
let commitSha = '';
try {
    commitSha = execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
} catch (e) {
    commitSha = process.env.GIT_COMMIT_SHA || '';
}
const appVersion = commitSha ? `v${systemVersion}-${commitSha}` : `v${systemVersion}`;

const app = express();
const port = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use((req, res, next) => {
    console.log(`[REQUEST] ${new Date().toISOString()} - ${req.method} ${req.url}`, req.body);
    next();
});
app.use(express.static(path.join(__dirname, 'public')));

// Database Config
const dbConfig = {
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    server: process.env.DB_SERVER,
    database: process.env.DB_DATABASE,
    options: {
        encrypt: true, // For Azure, or general security
        trustServerCertificate: process.env.DB_TRUST_SERVER_CERTIFICATE === 'true',
    }
};

// Database Pool Connection
let pool;
async function connectDB(retries = 5, delay = 3000) {
    for (let i = 0; i < retries; i++) {
        try {
            pool = await sql.connect(dbConfig);
            console.log('Connected to SQL Server successfully.');
            return pool;
        } catch (err) {
            console.error(`Database connection attempt ${i + 1} failed:`, err.message);
            if (i < retries - 1) {
                console.log(`Retrying in ${delay / 1000} seconds...`);
                await new Promise(res => setTimeout(res, delay));
            }
        }
    }
    throw new Error('Failed to connect to SQL Server after all retries');
}


// --- API ENDPOINTS ---

// --- EMPRESAS PARCEIRAS & TERCEIRIZADOS ---

// GET all companies
app.get('/api/empresas', async (req, res) => {
    try {
        const query = `
            SELECT emp.*, 
                   (SELECT COUNT(*) FROM ColaboradoresTerceirizados WHERE empresa_id = emp.id) as total_terceirizados
            FROM EmpresasParceiras emp
            ORDER BY emp.nome
        `;
        const result = await pool.request().query(query);
        res.json(result.recordset);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST new company
app.post('/api/empresas', async (req, res) => {
    const { nome, cnpj } = req.body;
    if (!nome || !cnpj) {
        return res.status(400).json({ error: 'Nome e CNPJ são obrigatórios.' });
    }
    try {
        const checkQuery = await pool.request()
            .input('cnpj', sql.NVarChar, cnpj)
            .query('SELECT id FROM EmpresasParceiras WHERE cnpj = @cnpj');
        if (checkQuery.recordset.length > 0) {
            return res.status(400).json({ error: 'CNPJ já cadastrado para outra empresa.' });
        }

        const result = await pool.request()
            .input('nome', sql.NVarChar, nome)
            .input('cnpj', sql.NVarChar, cnpj)
            .query('INSERT INTO EmpresasParceiras (nome, cnpj) OUTPUT INSERTED.* VALUES (@nome, @cnpj)');
        res.status(201).json(result.recordset[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// PUT update company
app.put('/api/empresas/:id', async (req, res) => {
    const { id } = req.params;
    const { nome, cnpj } = req.body;
    if (!nome || !cnpj) {
        return res.status(400).json({ error: 'Nome e CNPJ são obrigatórios.' });
    }
    try {
        const checkQuery = await pool.request()
            .input('id', sql.Int, id)
            .input('cnpj', sql.NVarChar, cnpj)
            .query('SELECT id FROM EmpresasParceiras WHERE cnpj = @cnpj AND id <> @id');
        if (checkQuery.recordset.length > 0) {
            return res.status(400).json({ error: 'CNPJ já cadastrado para outra empresa.' });
        }

        const result = await pool.request()
            .input('id', sql.Int, id)
            .input('nome', sql.NVarChar, nome)
            .input('cnpj', sql.NVarChar, cnpj)
            .query(`
                UPDATE EmpresasParceiras
                SET nome = @nome, cnpj = @cnpj
                OUTPUT INSERTED.*
                WHERE id = @id
            `);
        if (result.recordset.length === 0) {
            return res.status(404).json({ error: 'Empresa parceira não encontrada.' });
        }
        res.json(result.recordset[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// DELETE company
app.delete('/api/empresas/:id', async (req, res) => {
    const { id } = req.params;
    try {
        await pool.request()
            .input('id', sql.Int, id)
            .query('DELETE FROM EmpresasParceiras WHERE id = @id');
        res.json({ success: true, message: 'Empresa parceira excluída com sucesso.' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET all terceirizados
app.get('/api/terceirizados', async (req, res) => {
    try {
        const result = await pool.request().query('SELECT * FROM ColaboradoresTerceirizados ORDER BY nome');
        res.json(result.recordset);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET terceirizados for a specific company
app.get('/api/empresas/:empresaId/terceirizados', async (req, res) => {
    const { empresaId } = req.params;
    try {
        const result = await pool.request()
            .input('empresa_id', sql.Int, empresaId)
            .query('SELECT * FROM ColaboradoresTerceirizados WHERE empresa_id = @empresa_id ORDER BY nome');
        res.json(result.recordset);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST new terceirizado under a company
app.post('/api/empresas/:empresaId/terceirizados', async (req, res) => {
    const { empresaId } = req.params;
    const { nome, cpf, email, cargo } = req.body;
    if (!nome || !cpf || !email || !cargo) {
        return res.status(400).json({ error: 'Todos os campos (nome, cpf, email, cargo) são obrigatórios.' });
    }
    try {
        const result = await pool.request()
            .input('empresa_id', sql.Int, empresaId)
            .input('cpf', sql.NVarChar, cpf)
            .input('nome', sql.NVarChar, nome)
            .input('email', sql.NVarChar, email)
            .input('cargo', sql.NVarChar, cargo)
            .query(`
                INSERT INTO ColaboradoresTerceirizados (empresa_id, cpf, nome, email, cargo)
                OUTPUT INSERTED.*
                VALUES (@empresa_id, @cpf, @nome, @email, @cargo)
            `);
        res.status(201).json(result.recordset[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// PUT update terceirizado
app.put('/api/terceirizados/:id', async (req, res) => {
    const { id } = req.params;
    const { nome, cpf, email, cargo } = req.body;
    if (!nome || !cpf || !email || !cargo) {
        return res.status(400).json({ error: 'Todos os campos (nome, cpf, email, cargo) são obrigatórios.' });
    }
    try {
        const result = await pool.request()
            .input('id', sql.Int, id)
            .input('cpf', sql.NVarChar, cpf)
            .input('nome', sql.NVarChar, nome)
            .input('email', sql.NVarChar, email)
            .input('cargo', sql.NVarChar, cargo)
            .query(`
                UPDATE ColaboradoresTerceirizados
                SET cpf = @cpf, nome = @nome, email = @email, cargo = @cargo
                OUTPUT INSERTED.*
                WHERE id = @id
            `);
        if (result.recordset.length === 0) {
            return res.status(404).json({ error: 'Colaborador terceirizado não encontrado.' });
        }
        res.json(result.recordset[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// DELETE terceirizado
app.delete('/api/terceirizados/:id', async (req, res) => {
    const { id } = req.params;
    try {
        await pool.request()
            .input('id', sql.Int, id)
            .query('DELETE FROM ColaboradoresTerceirizados WHERE id = @id');
        res.json({ success: true, message: 'Colaborador terceirizado excluído com sucesso.' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});


// 1. DASHBOARD SUMMARY
app.get('/api/dashboard/summary', async (req, res) => {
    try {
        const query = `
            SELECT 
                (SELECT COUNT(*) FROM Projetos WHERE status = 'Em Andamento') as activeProjects,
                (SELECT COUNT(*) FROM Tarefas WHERE status = 'A Fazer' OR status = 'Em Progresso') as pendingTasks,
                (SELECT COUNT(*) FROM Colaboradores) as totalCollaborators,
                (SELECT COALESCE(SUM(horas), 0) FROM Apontamentos) as totalHoursWorked
        `;
        const result = await pool.request().query(query);
        res.json(result.recordset[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 1.5 GERENCIAS (MANAGEMENTS)
app.get('/api/gerencias', async (req, res) => {
    try {
        const query = `
            SELECT g.*, colab.nome as responsavel_nome
            FROM Gerencias g
            LEFT JOIN Colaboradores colab ON g.responsavel_id = colab.id
            ORDER BY g.nome
        `;
        const result = await pool.request().query(query);
        res.json(result.recordset);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/gerencias', async (req, res) => {
    const { nome, sigla, responsavel_id } = req.body;
    try {
        const result = await pool.request()
            .input('nome', sql.NVarChar, nome)
            .input('sigla', sql.NVarChar, sigla)
            .input('responsavel_id', sql.Int, responsavel_id || null)
            .query('INSERT INTO Gerencias (nome, sigla, responsavel_id) OUTPUT INSERTED.* VALUES (@nome, @sigla, @responsavel_id)');
        res.status(201).json(result.recordset[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.put('/api/gerencias/:id', async (req, res) => {
    const { id } = req.params;
    const { nome, sigla, responsavel_id } = req.body;
    try {
        const result = await pool.request()
            .input('id', sql.Int, id)
            .input('nome', sql.NVarChar, nome)
            .input('sigla', sql.NVarChar, sigla)
            .input('responsavel_id', sql.Int, responsavel_id || null)
            .query(`
                UPDATE Gerencias
                SET nome = @nome, sigla = @sigla, responsavel_id = @responsavel_id
                OUTPUT INSERTED.*
                WHERE id = @id
            `);
        res.json(result.recordset[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/gerencias/:id', async (req, res) => {
    const { id } = req.params;
    try {
        await pool.request()
            .input('id', sql.Int, id)
            .query('DELETE FROM Gerencias WHERE id = @id');
        res.json({ success: true, message: 'Management deleted successfully.' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 2. COORDINATIONS (COORDENADORIAS)
app.get('/api/coordenadorias', async (req, res) => {
    try {
        const query = `
            SELECT c.*, g.sigla as gerencia_sigla, g.nome as gerencia_nome,
                   coord.nome as coordenador_nome
            FROM Coordenadorias c
            LEFT JOIN Gerencias g ON c.gerencia_id = g.id
            LEFT JOIN Colaboradores coord ON c.coordenador_id = coord.id
            ORDER BY c.nome
        `;
        const result = await pool.request().query(query);
        res.json(result.recordset);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/coordenadorias', async (req, res) => {
    const { nome, sigla, gerencia_id, coordenador_id } = req.body;
    try {
        const result = await pool.request()
            .input('nome', sql.NVarChar, nome)
            .input('sigla', sql.NVarChar, sigla)
            .input('gerencia_id', sql.Int, gerencia_id || null)
            .input('coordenador_id', sql.Int, coordenador_id || null)
            .query('INSERT INTO Coordenadorias (nome, sigla, gerencia_id, coordenador_id) OUTPUT INSERTED.* VALUES (@nome, @sigla, @gerencia_id, @coordenador_id)');
        res.status(201).json(result.recordset[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.put('/api/coordenadorias/:id', async (req, res) => {
    const { id } = req.params;
    const { nome, sigla, gerencia_id, coordenador_id } = req.body;
    try {
        const result = await pool.request()
            .input('id', sql.Int, id)
            .input('nome', sql.NVarChar, nome)
            .input('sigla', sql.NVarChar, sigla)
            .input('gerencia_id', sql.Int, gerencia_id || null)
            .input('coordenador_id', sql.Int, coordenador_id || null)
            .query(`
                UPDATE Coordenadorias
                SET nome = @nome, sigla = @sigla, gerencia_id = @gerencia_id, coordenador_id = @coordenador_id
                OUTPUT INSERTED.*
                WHERE id = @id
            `);
        res.json(result.recordset[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/coordenadorias/:id', async (req, res) => {
    const { id } = req.params;
    try {
        await pool.request()
            .input('id', sql.Int, id)
            .query('DELETE FROM Coordenadorias WHERE id = @id');
        res.json({ success: true, message: 'Coordination deleted successfully.' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 3. COLLABORATORS (COLABORADORES)
app.get('/api/colaboradores', async (req, res) => {
    try {
        const queryColabs = `
            SELECT c.*, coord.sigla as coordenadoria_sigla, coord.nome as coordenadoria_nome, g.sigla as gerencia_sigla, g.nome as gerencia_nome
            FROM Colaboradores c
            LEFT JOIN Coordenadorias coord ON c.coordenadoria_id = coord.id
            INNER JOIN Gerencias g ON c.gerencia_id = g.id
            ORDER BY c.nome
        `;
        const resultColabs = await pool.request().query(queryColabs);
        const colabs = resultColabs.recordset;

        colabs.forEach(c => {
            c.projeto_ids = [];
        });

        const queryProfileLinks = `SELECT * FROM ColaboradorPerfis`;
        const resultProfileLinks = await pool.request().query(queryProfileLinks);
        const profileLinks = resultProfileLinks.recordset;

        const profileLinksMap = {};
        profileLinks.forEach(l => {
            if (!profileLinksMap[l.colaborador_id]) {
                profileLinksMap[l.colaborador_id] = [];
            }
            profileLinksMap[l.colaborador_id].push(l.perfil_id);
        });

        colabs.forEach(c => {
            c.perfil_ids = profileLinksMap[c.id] || [];
        });

        res.json(colabs);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/colaboradores', async (req, res) => {
    const { nome, email, cargo, gerencia_id, coordenadoria_id, cpf, senha, perfil_ids } = req.body;
    const transaction = new sql.Transaction(pool);
    try {
        await transaction.begin();
        
        const result = await transaction.request()
            .input('nome', sql.NVarChar, nome)
            .input('email', sql.NVarChar, email)
            .input('cargo', sql.NVarChar, cargo)
            .input('gerencia_id', sql.Int, gerencia_id)
            .input('coordenadoria_id', sql.Int, coordenadoria_id || null)
            .input('cpf', sql.NVarChar, cpf || null)
            .input('senha', sql.NVarChar, senha || null)
            .query(`
                INSERT INTO Colaboradores (nome, email, cargo, gerencia_id, coordenadoria_id, cpf, senha) 
                OUTPUT INSERTED.* 
                VALUES (@nome, @email, @cargo, @gerencia_id, @coordenadoria_id, @cpf, @senha)
            `);
        
        const colab = result.recordset[0];

        if (perfil_ids && Array.isArray(perfil_ids)) {
            for (const perfId of perfil_ids) {
                await transaction.request()
                    .input('colaborador_id', sql.Int, colab.id)
                    .input('perfil_id', sql.Int, perfId)
                    .query('INSERT INTO ColaboradorPerfis (colaborador_id, perfil_id) VALUES (@colaborador_id, @perfil_id)');
            }
        }

        await transaction.commit();
        colab.projeto_ids = [];
        colab.perfil_ids = perfil_ids || [];
        res.status(201).json(colab);
    } catch (err) {
        await transaction.rollback();
        res.status(500).json({ error: err.message });
    }
});

app.put('/api/colaboradores/:id', async (req, res) => {
    const { id } = req.params;
    const { nome, email, cargo, gerencia_id, coordenadoria_id, cpf, senha, perfil_ids } = req.body;
    const transaction = new sql.Transaction(pool);
    try {
        await transaction.begin();
        
        const result = await transaction.request()
            .input('id', sql.Int, id)
            .input('nome', sql.NVarChar, nome)
            .input('email', sql.NVarChar, email)
            .input('cargo', sql.NVarChar, cargo)
            .input('gerencia_id', sql.Int, gerencia_id)
            .input('coordenadoria_id', sql.Int, coordenadoria_id || null)
            .input('cpf', sql.NVarChar, cpf || null)
            .input('senha', sql.NVarChar, senha || null)
            .query(`
                UPDATE Colaboradores
                SET nome = @nome, email = @email, cargo = @cargo, gerencia_id = @gerencia_id, coordenadoria_id = @coordenadoria_id, cpf = @cpf, senha = @senha
                OUTPUT INSERTED.*
                WHERE id = @id
            `);
        
        if (result.recordset.length === 0) {
            await transaction.rollback();
            return res.status(404).json({ error: 'Collaborator not found.' });
        }

        // Clear existing profiles
        await transaction.request()
            .input('colaborador_id', sql.Int, id)
            .query('DELETE FROM ColaboradorPerfis WHERE colaborador_id = @colaborador_id');

        // Insert new profiles
        if (perfil_ids && Array.isArray(perfil_ids)) {
            for (const perfId of perfil_ids) {
                await transaction.request()
                    .input('colaborador_id', sql.Int, id)
                    .input('perfil_id', sql.Int, perfId)
                    .query('INSERT INTO ColaboradorPerfis (colaborador_id, perfil_id) VALUES (@colaborador_id, @perfil_id)');
            }
        }

        await transaction.commit();
        const colab = result.recordset[0];
        colab.projeto_ids = [];
        colab.perfil_ids = perfil_ids || [];
        res.json(colab);
    } catch (err) {
        await transaction.rollback();
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/colaboradores/:id', async (req, res) => {
    const { id } = req.params;
    try {
        await pool.request()
            .input('id', sql.Int, id)
            .query('DELETE FROM Colaboradores WHERE id = @id');
        res.json({ success: true, message: 'Collaborator deleted successfully.' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/projetos', async (req, res) => {
    try {
        const query = `
            SELECT p.*, coord.sigla as coordenadoria_sigla, g.sigla as gerencia_sigla, g.nome as gerencia_nome,
                   (SELECT COUNT(*) FROM Tarefas WHERE projeto_id = p.id) as total_tasks,
                   (SELECT COUNT(*) FROM Tarefas WHERE projeto_id = p.id AND status = 'Concluída') as completed_tasks
            FROM Projetos p
            LEFT JOIN Coordenadorias coord ON p.coordenadoria_id = coord.id
            INNER JOIN Gerencias g ON p.gerencia_id = g.id
            ORDER BY p.data_inicio DESC
        `;
        const result = await pool.request().query(query);
        res.json(result.recordset);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/projetos', async (req, res) => {
    const { nome, descricao, data_inicio, data_fim, gerencia_id, coordenadoria_id, status } = req.body;
    try {
        const result = await pool.request()
            .input('nome', sql.VarChar, nome)
            .input('descricao', sql.VarChar, descricao || null)
            .input('data_inicio', sql.Date, data_inicio)
            .input('data_fim', sql.Date, data_fim || null)
            .input('gerencia_id', sql.Int, gerencia_id)
            .input('coordenadoria_id', sql.Int, coordenadoria_id || null)
            .input('status', sql.VarChar, status || 'Em Andamento')
            .query(`
                INSERT INTO Projetos (nome, descricao, data_inicio, data_fim, gerencia_id, coordenadoria_id, status) 
                OUTPUT INSERTED.* 
                VALUES (@nome, @descricao, @data_inicio, @data_fim, @gerencia_id, @coordenadoria_id, @status)
            `);
        res.status(201).json(result.recordset[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.put('/api/projetos/:id', async (req, res) => {
    const { id } = req.params;
    const { nome, descricao, data_inicio, data_fim, gerencia_id, coordenadoria_id, status } = req.body;
    try {
        const result = await pool.request()
            .input('id', sql.Int, id)
            .input('nome', sql.VarChar, nome)
            .input('descricao', sql.VarChar, descricao || null)
            .input('data_inicio', sql.Date, data_inicio)
            .input('data_fim', sql.Date, data_fim || null)
            .input('gerencia_id', sql.Int, gerencia_id)
            .input('coordenadoria_id', sql.Int, coordenadoria_id || null)
            .input('status', sql.VarChar, status)
            .query(`
                UPDATE Projetos 
                SET nome = @nome, descricao = @descricao, data_inicio = @data_inicio, 
                    data_fim = @data_fim, gerencia_id = @gerencia_id, coordenadoria_id = @coordenadoria_id, status = @status
                OUTPUT INSERTED.*
                WHERE id = @id
            `);
        res.json(result.recordset[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/projetos/:id', async (req, res) => {
    const { id } = req.params;
    try {
        await pool.request()
            .input('id', sql.Int, id)
            .query('DELETE FROM Projetos WHERE id = @id');
        res.json({ success: true, message: 'Project deleted successfully.' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 5. TASKS (TAREFAS)
app.get('/api/tarefas', async (req, res) => {
    try {
        const queryTasks = `
            SELECT t.*, p.nome as projeto_nome, c.nome as colaborador_nome, c.email as colaborador_email, s.nome as solicitante_nome
            FROM Tarefas t
            JOIN Projetos p ON t.projeto_id = p.id
            LEFT JOIN Colaboradores c ON t.colaborador_id = c.id
            LEFT JOIN Solicitantes s ON t.solicitante_id = s.id
            ORDER BY t.data_entrega ASC
        `;
        const resultTasks = await pool.request().query(queryTasks);
        const tasks = resultTasks.recordset;

        const querySubtasks = `
            SELECT s.*, 
                   COALESCE(c.nome, ct.nome) as colaborador_nome,
                   ct.nome as colaborador_terceirizado_nome,
                   CASE 
                       WHEN s.colaborador_id IS NOT NULL THEN 'Prodesp'
                       WHEN s.colaborador_terceirizado_id IS NOT NULL THEN ep.nome
                       ELSE NULL
                   END as colaborador_empresa
            FROM SubTarefas s 
            LEFT JOIN Colaboradores c ON s.colaborador_id = c.id
            LEFT JOIN ColaboradoresTerceirizados ct ON s.colaborador_terceirizado_id = ct.id
            LEFT JOIN EmpresasParceiras ep ON ct.empresa_id = ep.id
        `;
        const resultSubtasks = await pool.request().query(querySubtasks);
        const subtasks = resultSubtasks.recordset;

        // Group subtasks by tarefa_id
        const subtasksMap = {};
        subtasks.forEach(sub => {
            if (!subtasksMap[sub.tarefa_id]) {
                subtasksMap[sub.tarefa_id] = [];
            }
            subtasksMap[sub.tarefa_id].push(sub);
        });

        // Attach subtasks array to each task
        tasks.forEach(task => {
            task.subtasks = subtasksMap[task.id] || [];
        });

        res.json(tasks);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/tarefas', async (req, res) => {
    const { projeto_id, titulo, descricao, status, prioridade, data_entrega, horas_estimadas, horas_trabalhadas, colaborador_id, solicitante_id } = req.body;
    try {
        const result = await pool.request()
            .input('projeto_id', sql.Int, projeto_id)
            .input('titulo', sql.NVarChar, titulo)
            .input('descricao', sql.NVarChar, descricao || null)
            .input('status', sql.NVarChar, status || 'A Fazer')
            .input('prioridade', sql.NVarChar, prioridade || 'Média')
            .input('data_entrega', sql.Date, data_entrega || null)
            .input('horas_estimadas', sql.Decimal(5, 2), horas_estimadas || 0)
            .input('horas_trabalhadas', sql.Decimal(5, 2), horas_trabalhadas || 0)
            .input('colaborador_id', sql.Int, colaborador_id || null)
            .input('solicitante_id', sql.Int, solicitante_id || null)
            .query(`
                INSERT INTO Tarefas (projeto_id, titulo, descricao, status, prioridade, data_entrega, horas_estimadas, horas_trabalhadas, colaborador_id, solicitante_id)
                OUTPUT INSERTED.*
                VALUES (@projeto_id, @titulo, @descricao, @status, @prioridade, @data_entrega, @horas_estimadas, @horas_trabalhadas, @colaborador_id, @solicitante_id)
            `);
        res.status(201).json(result.recordset[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.put('/api/tarefas/:id', async (req, res) => {
    const { id } = req.params;
    try {
        // Find existing task
        const existingResult = await pool.request()
            .input('id', sql.Int, id)
            .query('SELECT * FROM Tarefas WHERE id = @id');
        
        if (existingResult.recordset.length === 0) {
            return res.status(404).json({ error: 'Task not found.' });
        }
        
        const existingTask = existingResult.recordset[0];
        
        // Merge values: use body value if defined, otherwise keep existing database value
        const projeto_id = req.body.projeto_id !== undefined ? req.body.projeto_id : existingTask.projeto_id;
        const titulo = req.body.titulo !== undefined ? req.body.titulo : existingTask.titulo;
        const descricao = req.body.descricao !== undefined ? req.body.descricao : existingTask.descricao;
        const status = req.body.status !== undefined ? req.body.status : existingTask.status;
        const prioridade = req.body.prioridade !== undefined ? req.body.prioridade : existingTask.prioridade;
        const data_entrega = req.body.data_entrega !== undefined ? req.body.data_entrega : existingTask.data_entrega;
        const horas_estimadas = req.body.horas_estimadas !== undefined ? req.body.horas_estimadas : existingTask.horas_estimadas;
        const horas_trabalhadas = req.body.horas_trabalhadas !== undefined ? req.body.horas_trabalhadas : existingTask.horas_trabalhadas;
        const colaborador_id = req.body.colaborador_id !== undefined ? req.body.colaborador_id : existingTask.colaborador_id;
        const solicitante_id = req.body.solicitante_id !== undefined ? req.body.solicitante_id : existingTask.solicitante_id;

        const result = await pool.request()
            .input('id', sql.Int, id)
            .input('projeto_id', sql.Int, projeto_id)
            .input('titulo', sql.NVarChar, titulo)
            .input('descricao', sql.NVarChar, descricao || null)
            .input('status', sql.NVarChar, status)
            .input('horas_trabalhadas', sql.Decimal(5, 2), horas_trabalhadas !== null && horas_trabalhadas !== undefined ? horas_trabalhadas : 0)
            .input('colaborador_id', sql.Int, colaborador_id || null)
            .input('prioridade', sql.NVarChar, prioridade)
            .input('data_entrega', sql.Date, data_entrega || null)
            .input('horas_estimadas', sql.Decimal(5, 2), horas_estimadas !== null && horas_estimadas !== undefined ? horas_estimadas : 0)
            .input('solicitante_id', sql.Int, solicitante_id || null)
            .query(`
                UPDATE Tarefas
                SET projeto_id = @projeto_id, titulo = @titulo, descricao = @descricao, 
                    status = @status, prioridade = @prioridade, data_entrega = @data_entrega, 
                    horas_estimadas = @horas_estimadas, horas_trabalhadas = @horas_trabalhadas, 
                    colaborador_id = @colaborador_id, solicitante_id = @solicitante_id
                OUTPUT INSERTED.*
                WHERE id = @id
            `);
        res.json(result.recordset[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/tarefas/:id', async (req, res) => {
    const { id } = req.params;
    try {
        const checkApont = await pool.request()
            .input('tarefa_id', sql.Int, id)
            .query('SELECT COUNT(*) as count FROM Apontamentos WHERE tarefa_id = @tarefa_id');
        if (checkApont.recordset[0].count > 0) {
            return res.status(400).json({ error: 'Não é possível excluir esta tarefa pois ela já possui apontamentos de horas registrados.' });
        }

        await pool.request()
            .input('id', sql.Int, id)
            .query('DELETE FROM Tarefas WHERE id = @id');
        res.json({ success: true, message: 'Task deleted successfully.' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 6. SUBTASKS (SUB-TAREFAS)
app.get('/api/subtarefas/:tarefa_id', async (req, res) => {
    const { tarefa_id } = req.params;
    try {
        const result = await pool.request()
            .input('tarefa_id', sql.Int, tarefa_id)
            .query(`
                SELECT s.*, 
                       COALESCE(c.nome, ct.nome) as colaborador_nome,
                       ct.nome as colaborador_terceirizado_nome,
                       CASE 
                           WHEN s.colaborador_id IS NOT NULL THEN 'Prodesp'
                           WHEN s.colaborador_terceirizado_id IS NOT NULL THEN ep.nome
                           ELSE NULL
                       END as colaborador_empresa
                FROM SubTarefas s 
                LEFT JOIN Colaboradores c ON s.colaborador_id = c.id 
                LEFT JOIN ColaboradoresTerceirizados ct ON s.colaborador_terceirizado_id = ct.id
                LEFT JOIN EmpresasParceiras ep ON ct.empresa_id = ep.id
                WHERE s.tarefa_id = @tarefa_id
            `);
        res.json(result.recordset);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/subtarefas', async (req, res) => {
    const { tarefa_id, titulo, concluida, colaborador_id, colaborador_terceirizado_id } = req.body;
    try {
        const result = await pool.request()
            .input('tarefa_id', sql.Int, tarefa_id)
            .input('titulo', sql.NVarChar, titulo)
            .input('concluida', sql.Bit, concluida ? 1 : 0)
            .input('colaborador_id', sql.Int, colaborador_id || null)
            .input('colaborador_terceirizado_id', sql.Int, colaborador_terceirizado_id || null)
            .query(`
                INSERT INTO SubTarefas (tarefa_id, titulo, concluida, colaborador_id, colaborador_terceirizado_id)
                OUTPUT INSERTED.*
                VALUES (@tarefa_id, @titulo, @concluida, @colaborador_id, @colaborador_terceirizado_id)
            `);
        res.status(201).json(result.recordset[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.put('/api/subtarefas/:id', async (req, res) => {
    const { id } = req.params;
    const { concluida } = req.body;
    try {
        const result = await pool.request()
            .input('id', sql.Int, id)
            .input('concluida', sql.Bit, concluida ? 1 : 0)
            .query(`
                UPDATE SubTarefas
                SET concluida = @concluida
                OUTPUT INSERTED.*
                WHERE id = @id
            `);
        res.json(result.recordset[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.put('/api/subtarefas/detalhes/:id', async (req, res) => {
    const { id } = req.params;
    const { titulo, concluida, colaborador_id, colaborador_terceirizado_id } = req.body;
    try {
        const result = await pool.request()
            .input('id', sql.Int, id)
            .input('titulo', sql.NVarChar, titulo)
            .input('concluida', sql.Bit, concluida ? 1 : 0)
            .input('colaborador_id', sql.Int, colaborador_id || null)
            .input('colaborador_terceirizado_id', sql.Int, colaborador_terceirizado_id || null)
            .query(`
                UPDATE SubTarefas
                SET titulo = @titulo, concluida = @concluida, colaborador_id = @colaborador_id, colaborador_terceirizado_id = @colaborador_terceirizado_id
                OUTPUT INSERTED.*
                WHERE id = @id
            `);
        res.json(result.recordset[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/subtarefas/:id', async (req, res) => {
    const { id } = req.params;
    try {
        const checkApont = await pool.request()
            .input('subtarefa_id', sql.Int, id)
            .query('SELECT COUNT(*) as count FROM Apontamentos WHERE subtarefa_id = @subtarefa_id');
        if (checkApont.recordset[0].count > 0) {
            return res.status(400).json({ error: 'Não é possível excluir esta sub-tarefa pois ela já possui apontamentos de horas registrados.' });
        }

        await pool.request()
            .input('id', sql.Int, id)
            .query('DELETE FROM SubTarefas WHERE id = @id');
        res.json({ success: true, message: 'Subtask deleted successfully.' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 7. MONTHLY CLOSING REPORT (FECHAMENTO MENSAL)
app.get('/api/relatorios/fechamento', async (req, res) => {
    const { fechamento_id } = req.query;
    if (!fechamento_id) {
        return res.status(400).json({ error: 'Closing Period ID (fechamento_id) parameter is required.' });
    }

    try {
        // Fetch data_inicio and data_fim for the given fechamento_id
        const periodResult = await pool.request()
            .input('id', sql.Int, fechamento_id)
            .query('SELECT * FROM MesesFechamento WHERE id = @id');
        
        if (periodResult.recordset.length === 0) {
            return res.status(404).json({ error: 'Closing period not found.' });
        }
        
        const period = periodResult.recordset[0];
        const data_inicio = period.data_inicio;
        const data_fim = period.data_fim;

        // Query Project Aggregates for the period (based on Apontamentos and Tasks scheduled for the period)
        const queryProjetos = `
            SELECT 
                p.id as projeto_id,
                p.nome as projeto_nome,
                coord.sigla as coordenadoria_sigla,
                (SELECT COUNT(*) FROM Tarefas WHERE projeto_id = p.id AND data_entrega >= @data_inicio AND data_entrega <= @data_fim) as total_tarefas,
                (SELECT COUNT(*) FROM Tarefas WHERE projeto_id = p.id AND status = 'Concluída' AND data_entrega >= @data_inicio AND data_entrega <= @data_fim) as tarefas_concluidas,
                0 as total_horas_estimadas,
                COALESCE((SELECT SUM(horas) FROM Apontamentos WHERE projeto_id = p.id AND data_apontamento >= @data_inicio AND data_apontamento <= @data_fim), 0) as total_horas_trabalhadas,
                COALESCE((SELECT COUNT(DISTINCT colaborador_id) FROM Apontamentos WHERE projeto_id = p.id AND data_apontamento >= @data_inicio AND data_apontamento <= @data_fim), 0) as colaboradores_alocados
            FROM Projetos p
            LEFT JOIN Coordenadorias coord ON p.coordenadoria_id = coord.id
            WHERE 
                p.id IN (SELECT DISTINCT projeto_id FROM Tarefas WHERE data_entrega >= @data_inicio AND data_entrega <= @data_fim)
                OR p.id IN (SELECT DISTINCT projeto_id FROM Apontamentos WHERE data_apontamento >= @data_inicio AND data_apontamento <= @data_fim)
            ORDER BY p.nome
        `;

        // Query Collaborator Aggregates for the period (based on Apontamentos logged in that period)
        const queryColaboradores = `
            SELECT 
                c.id as colaborador_id,
                c.nome as colaborador_nome,
                coord.sigla as coordenadoria_sigla,
                COALESCE((SELECT COUNT(DISTINCT projeto_id) FROM Apontamentos WHERE colaborador_id = c.id AND data_apontamento >= @data_inicio AND data_apontamento <= @data_fim), 0) as total_projetos,
                COALESCE((SELECT COUNT(id) FROM Apontamentos WHERE colaborador_id = c.id AND data_apontamento >= @data_inicio AND data_apontamento <= @data_fim), 0) as total_tarefas,
                COALESCE((SELECT COUNT(id) FROM Tarefas WHERE colaborador_id = c.id AND status = 'Concluída' AND data_entrega >= @data_inicio AND data_entrega <= @data_fim), 0) as tarefas_concluidas,
                COALESCE((SELECT SUM(horas) FROM Apontamentos WHERE colaborador_id = c.id AND data_apontamento >= @data_inicio AND data_apontamento <= @data_fim), 0) as total_horas_trabalhadas
            FROM Colaboradores c
            LEFT JOIN Coordenadorias coord ON c.coordenadoria_id = coord.id
            WHERE 
                c.id IN (SELECT DISTINCT colaborador_id FROM Apontamentos WHERE data_apontamento >= @data_inicio AND data_apontamento <= @data_fim)
            ORDER BY c.nome
        `;

        const request = pool.request()
            .input('data_inicio', sql.Date, data_inicio)
            .input('data_fim', sql.Date, data_fim);

        const resProjetos = await request.query(queryProjetos);
        
        const request2 = pool.request()
            .input('data_inicio', sql.Date, data_inicio)
            .input('data_fim', sql.Date, data_fim);
        const resColaboradores = await request2.query(queryColaboradores);

        res.json({
            period: {
                id: period.id,
                descricao: period.descricao,
                data_inicio: period.data_inicio,
                data_fim: period.data_fim
            },
            projetos: resProjetos.recordset,
            colaboradores: resColaboradores.recordset
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 7.5 MONTHS OF CLOSING (MESES DE FECHAMENTO)
app.get('/api/meses-fechamento', async (req, res) => {
    try {
        const result = await pool.request().query('SELECT * FROM MesesFechamento ORDER BY data_inicio DESC');
        res.json(result.recordset);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/meses-fechamento', async (req, res) => {
    const { descricao, data_inicio, data_fim } = req.body;
    if (!descricao || !data_inicio || !data_fim) {
        return res.status(400).json({ error: 'Description (descricao), Start Date (data_inicio), and End Date (data_fim) are required.' });
    }
    try {
        const result = await pool.request()
            .input('descricao', sql.NVarChar, descricao)
            .input('data_inicio', sql.Date, data_inicio)
            .input('data_fim', sql.Date, data_fim)
            .query('INSERT INTO MesesFechamento (descricao, data_inicio, data_fim) OUTPUT INSERTED.* VALUES (@descricao, @data_inicio, @data_fim)');
        res.status(201).json(result.recordset[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/meses-fechamento/:id', async (req, res) => {
    const { id } = req.params;
    try {
        const checkActive = await pool.request()
            .input('id', sql.Int, id)
            .query('SELECT ativo FROM MesesFechamento WHERE id = @id');
        
        const isActive = checkActive.recordset.length > 0 && checkActive.recordset[0].ativo;

        await pool.request()
            .input('id', sql.Int, id)
            .query('DELETE FROM MesesFechamento WHERE id = @id');

        if (isActive) {
            await pool.request().query(`
                DECLARE @recent_id INT = (SELECT TOP 1 id FROM MesesFechamento ORDER BY data_inicio DESC);
                IF @recent_id IS NOT NULL
                BEGIN
                    UPDATE MesesFechamento SET ativo = 1 WHERE id = @recent_id;
                END
            `);
        }

        res.json({ success: true, message: 'Closing period deleted successfully.' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.put('/api/meses-fechamento/:id/ativar', async (req, res) => {
    const { id } = req.params;
    try {
        const query = `
            UPDATE MesesFechamento SET ativo = 0;
            UPDATE MesesFechamento SET ativo = 1 WHERE id = @id;
        `;
        await pool.request()
            .input('id', sql.Int, id)
            .query(query);
            
        res.json({ success: true, message: 'Período ativado com sucesso.' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 8. APONTAMENTOS (TIME LOGS)
app.get('/api/apontamentos', async (req, res) => {
    try {
        const query = `
            SELECT a.*, 
                   colab.nome as colaborador_nome, 
                   p.nome as projeto_nome, 
                   t.titulo as tarefa_titulo, 
                   s.titulo as subtarefa_titulo
            FROM Apontamentos a
            JOIN Colaboradores colab ON a.colaborador_id = colab.id
            JOIN Projetos p ON a.projeto_id = p.id
            JOIN Tarefas t ON a.tarefa_id = t.id
            LEFT JOIN SubTarefas s ON a.subtarefa_id = s.id
            ORDER BY a.data_apontamento DESC, a.id DESC
        `;
        const result = await pool.request().query(query);
        res.json(result.recordset);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/apontamentos', async (req, res) => {
    const { colaborador_id, projeto_id, tarefa_id, subtarefa_id, data_apontamento, horas, descricao } = req.body;
    try {
        const result = await pool.request()
            .input('colaborador_id', sql.Int, colaborador_id)
            .input('projeto_id', sql.Int, projeto_id)
            .input('tarefa_id', sql.Int, tarefa_id)
            .input('subtarefa_id', sql.Int, subtarefa_id || null)
            .input('data_apontamento', sql.Date, data_apontamento)
            .input('horas', sql.Decimal(5, 2), horas !== null && horas !== undefined && horas !== '' ? horas : null)
            .input('descricao', sql.NVarChar, descricao)
            .query(`
                INSERT INTO Apontamentos (colaborador_id, projeto_id, tarefa_id, subtarefa_id, data_apontamento, horas, descricao)
                OUTPUT INSERTED.*
                VALUES (@colaborador_id, @projeto_id, @tarefa_id, @subtarefa_id, @data_apontamento, @horas, @descricao)
            `);
        res.status(201).json(result.recordset[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/apontamentos/:id', async (req, res) => {
    const { id } = req.params;
    try {
        await pool.request()
            .input('id', sql.Int, id)
            .query('DELETE FROM Apontamentos WHERE id = @id');
        res.json({ success: true, message: 'Time log deleted successfully.' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 9. SOLICITANTES (REQUESTERS)
app.get('/api/solicitantes', async (req, res) => {
    try {
        const result = await pool.request().query('SELECT * FROM Solicitantes ORDER BY nome ASC');
        res.json(result.recordset);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/solicitantes', async (req, res) => {
    const { nome, setor } = req.body;
    try {
        const result = await pool.request()
            .input('nome', sql.NVarChar, nome)
            .input('setor', sql.NVarChar, setor)
            .query(`
                INSERT INTO Solicitantes (nome, setor)
                OUTPUT INSERTED.*
                VALUES (@nome, @setor)
            `);
        res.status(201).json(result.recordset[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.put('/api/solicitantes/:id', async (req, res) => {
    const { id } = req.params;
    const { nome, setor } = req.body;
    try {
        const result = await pool.request()
            .input('id', sql.Int, id)
            .input('nome', sql.NVarChar, nome)
            .input('setor', sql.NVarChar, setor)
            .query(`
                UPDATE Solicitantes
                SET nome = @nome, setor = @setor
                OUTPUT INSERTED.*
                WHERE id = @id
            `);
        if (result.recordset.length === 0) {
            return res.status(404).json({ error: 'Requester not found.' });
        }
        res.json(result.recordset[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/solicitantes/:id', async (req, res) => {
    const { id } = req.params;
    try {
        await pool.request()
            .input('id', sql.Int, id)
            .query('DELETE FROM Solicitantes WHERE id = @id');
        res.json({ success: true, message: 'Requester deleted successfully.' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 10. PERFIS (PROFILES)
// 10. PERFIS (PROFILES)
app.get('/api/perfis', async (req, res) => {
    try {
        const result = await pool.request().query('SELECT * FROM Perfis ORDER BY nome ASC');
        const perfis = result.recordset;

        const queryLinks = `SELECT * FROM ColaboradorPerfis`;
        const resultLinks = await pool.request().query(queryLinks);
        const links = resultLinks.recordset;

        const linksMap = {};
        links.forEach(l => {
            if (!linksMap[l.perfil_id]) {
                linksMap[l.perfil_id] = [];
            }
            linksMap[l.perfil_id].push(l.colaborador_id);
        });

        // Fetch functionality mapping
        const queryFuncLinks = `SELECT * FROM PerfilFuncionalidades`;
        const resultFuncLinks = await pool.request().query(queryFuncLinks);
        const funcLinks = resultFuncLinks.recordset;

        const funcLinksMap = {};
        funcLinks.forEach(fl => {
            if (!funcLinksMap[fl.perfil_id]) {
                funcLinksMap[fl.perfil_id] = [];
            }
            funcLinksMap[fl.perfil_id].push(fl.funcionalidade_id);
        });

        perfis.forEach(p => {
            p.colaborador_ids = linksMap[p.id] || [];
            p.funcionalidade_ids = funcLinksMap[p.id] || [];
        });

        res.json(perfis);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/perfis', async (req, res) => {
    const { nome, colaborador_ids, funcionalidade_ids } = req.body;
    const transaction = new sql.Transaction(pool);
    try {
        await transaction.begin();
        const result = await transaction.request()
            .input('nome', sql.NVarChar, nome)
            .query(`
                INSERT INTO Perfis (nome)
                OUTPUT INSERTED.*
                VALUES (@nome)
            `);
        const perfil = result.recordset[0];

        if (colaborador_ids && Array.isArray(colaborador_ids)) {
            for (const colabId of colaborador_ids) {
                await transaction.request()
                    .input('colaborador_id', sql.Int, colabId)
                    .input('perfil_id', sql.Int, perfil.id)
                    .query('INSERT INTO ColaboradorPerfis (colaborador_id, perfil_id) VALUES (@colaborador_id, @perfil_id)');
            }
        }

        if (funcionalidade_ids && Array.isArray(funcionalidade_ids)) {
            for (const funcId of funcionalidade_ids) {
                await transaction.request()
                    .input('perfil_id', sql.Int, perfil.id)
                    .input('funcionalidade_id', sql.Int, funcId)
                    .query('INSERT INTO PerfilFuncionalidades (perfil_id, funcionalidade_id) VALUES (@perfil_id, @funcionalidade_id)');
            }
        }

        await transaction.commit();
        perfil.colaborador_ids = colaborador_ids || [];
        perfil.funcionalidade_ids = funcionalidade_ids || [];
        res.status(201).json(perfil);
    } catch (err) {
        await transaction.rollback();
        res.status(500).json({ error: err.message });
    }
});

app.put('/api/perfis/:id', async (req, res) => {
    const { id } = req.params;
    const { nome, colaborador_ids, funcionalidade_ids } = req.body;
    const transaction = new sql.Transaction(pool);
    try {
        await transaction.begin();
        const result = await transaction.request()
            .input('id', sql.Int, id)
            .input('nome', sql.NVarChar, nome)
            .query(`
                UPDATE Perfis
                SET nome = @nome
                OUTPUT INSERTED.*
                WHERE id = @id
            `);
        if (result.recordset.length === 0) {
            await transaction.rollback();
            return res.status(404).json({ error: 'Profile not found.' });
        }

        // Clear existing collaborator links
        await transaction.request()
            .input('perfil_id', sql.Int, id)
            .query('DELETE FROM ColaboradorPerfis WHERE perfil_id = @perfil_id');

        // Insert new collaborator links
        if (colaborador_ids && Array.isArray(colaborador_ids)) {
            for (const colabId of colaborador_ids) {
                await transaction.request()
                    .input('colaborador_id', sql.Int, colabId)
                    .input('perfil_id', sql.Int, id)
                    .query('INSERT INTO ColaboradorPerfis (colaborador_id, perfil_id) VALUES (@colaborador_id, @perfil_id)');
            }
        }

        // Clear existing functionality links
        await transaction.request()
            .input('perfil_id', sql.Int, id)
            .query('DELETE FROM PerfilFuncionalidades WHERE perfil_id = @perfil_id');

        // Insert new functionality links
        if (funcionalidade_ids && Array.isArray(funcionalidade_ids)) {
            for (const funcId of funcionalidade_ids) {
                await transaction.request()
                    .input('perfil_id', sql.Int, id)
                    .input('funcionalidade_id', sql.Int, funcId)
                    .query('INSERT INTO PerfilFuncionalidades (perfil_id, funcionalidade_id) VALUES (@perfil_id, @funcionalidade_id)');
            }
        }

        await transaction.commit();
        const perfil = result.recordset[0];
        perfil.colaborador_ids = colaborador_ids || [];
        perfil.funcionalidade_ids = funcionalidade_ids || [];
        res.json(perfil);
    } catch (err) {
        await transaction.rollback();
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/perfis/:id', async (req, res) => {
    const { id } = req.params;
    try {
        await pool.request()
            .input('id', sql.Int, id)
            .query('DELETE FROM Perfis WHERE id = @id');
        res.json({ success: true, message: 'Profile deleted successfully.' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 11. FUNCIONALIDADES (FUNCTIONALITIES)
app.get('/api/funcionalidades', async (req, res) => {
    try {
        const result = await pool.request().query('SELECT * FROM Funcionalidades ORDER BY nome ASC');
        res.json(result.recordset);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/funcionalidades', async (req, res) => {
    const { nome, chave } = req.body;
    try {
        const result = await pool.request()
            .input('nome', sql.NVarChar, nome)
            .input('chave', sql.NVarChar, chave)
            .query(`
                INSERT INTO Funcionalidades (nome, chave)
                OUTPUT INSERTED.*
                VALUES (@nome, @chave)
            `);
        res.status(201).json(result.recordset[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.put('/api/funcionalidades/:id', async (req, res) => {
    const { id } = req.params;
    const { nome, chave } = req.body;
    try {
        const result = await pool.request()
            .input('id', sql.Int, id)
            .input('nome', sql.NVarChar, nome)
            .input('chave', sql.NVarChar, chave)
            .query(`
                UPDATE Funcionalidades
                SET nome = @nome, chave = @chave
                OUTPUT INSERTED.*
                WHERE id = @id
            `);
        if (result.recordset.length === 0) {
            return res.status(404).json({ error: 'Functionality not found.' });
        }
        res.json(result.recordset[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/funcionalidades/:id', async (req, res) => {
    const { id } = req.params;
    try {
        await pool.request()
            .input('id', sql.Int, id)
            .query('DELETE FROM Funcionalidades WHERE id = @id');
        res.json({ success: true, message: 'Functionality deleted successfully.' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 12. AUTHENTICATION
app.post('/api/auth/login', async (req, res) => {
    const { cpf, senha } = req.body;
    if (!cpf || !senha) {
        return res.status(400).json({ error: 'CPF e senha são obrigatórios.' });
    }

    try {
        const colabResult = await pool.request()
            .input('cpf', sql.NVarChar, cpf)
            .input('senha', sql.NVarChar, senha)
            .query('SELECT * FROM Colaboradores WHERE cpf = @cpf AND senha = @senha');

        if (colabResult.recordset.length === 0) {
            return res.status(401).json({ error: 'Credenciais inválidas. Verifique seu CPF e senha.' });
        }

        const user = colabResult.recordset[0];

        const profileResult = await pool.request()
            .input('colaborador_id', sql.Int, user.id)
            .query(`
                SELECT p.* FROM Perfis p
                INNER JOIN ColaboradorPerfis cp ON p.id = cp.perfil_id
                WHERE cp.colaborador_id = @colaborador_id
            `);
        const profiles = profileResult.recordset;

        let functionalities = [];
        if (profiles.length > 0) {
            const profileIds = profiles.map(p => p.id).join(',');
            const funcResult = await pool.request()
                .query(`
                    SELECT DISTINCT f.chave FROM Funcionalidades f
                    INNER JOIN PerfilFuncionalidades pf ON f.id = pf.funcionalidade_id
                    WHERE pf.perfil_id IN (${profileIds})
                `);
            functionalities = funcResult.recordset.map(f => f.chave);
        }

        res.json({
            id: user.id,
            nome: user.nome,
            email: user.email,
            cargo: user.cargo,
            coordenadoria_id: user.coordenadoria_id,
            profiles: profiles.map(p => p.nome),
            functionalities: functionalities
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/version', (req, res) => {
    res.json({ version: appVersion });
});

// SPA Route: fallback to index.html
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start Server
async function startServer() {
    try {
        await connectDB();
        
        // Execute migrations/DDL checks for new tables
        console.log('Verifying and applying database schemas...');
        await pool.request().query(`
            -- Create EmpresasParceiras table if not exists
            IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'EmpresasParceiras')
            BEGIN
                CREATE TABLE EmpresasParceiras (
                    id INT IDENTITY(1,1) PRIMARY KEY,
                    nome NVARCHAR(150) NOT NULL,
                    cnpj NVARCHAR(18) NOT NULL UNIQUE
                );
            END

            -- Create ColaboradoresTerceirizados table if not exists
            IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'ColaboradoresTerceirizados')
            BEGIN
                CREATE TABLE ColaboradoresTerceirizados (
                    id INT IDENTITY(1,1) PRIMARY KEY,
                    empresa_id INT NOT NULL FOREIGN KEY REFERENCES EmpresasParceiras(id) ON DELETE CASCADE,
                    cpf NVARCHAR(14) NOT NULL,
                    nome NVARCHAR(150) NOT NULL,
                    email NVARCHAR(150) NOT NULL,
                    cargo NVARCHAR(100) NOT NULL
                );
            END

            -- Add colaborador_terceirizado_id column to SubTarefas if not exists
            IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('SubTarefas') AND name = 'colaborador_terceirizado_id')
            BEGIN
                ALTER TABLE SubTarefas ADD colaborador_terceirizado_id INT NULL 
                CONSTRAINT FK_SubTarefas_ColaboradoresTerceirizados FOREIGN KEY REFERENCES ColaboradoresTerceirizados(id) ON DELETE SET NULL;
            END

            -- Add ativo column to MesesFechamento if not exists
            IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('MesesFechamento') AND name = 'ativo')
            BEGIN
                ALTER TABLE MesesFechamento ADD ativo BIT NOT NULL DEFAULT 0;
            END

            -- Set the most recent period as active if none is active
            EXEC('
                IF NOT EXISTS (SELECT * FROM MesesFechamento WHERE ativo = 1)
                BEGIN
                    DECLARE @recent_id INT = (SELECT TOP 1 id FROM MesesFechamento ORDER BY data_inicio DESC);
                    IF @recent_id IS NOT NULL
                    BEGIN
                        UPDATE MesesFechamento SET ativo = 1 WHERE id = @recent_id;
                    END
                END
            ');

            -- Create the new functionality if it doesn't exist
            IF NOT EXISTS (SELECT * FROM Funcionalidades WHERE chave = 'empresas')
            BEGIN
                INSERT INTO Funcionalidades (nome, chave) VALUES (N'Empresas Parceiras', N'empresas');
                
                -- Also link it to the Administrador profile if it exists
                DECLARE @admin_id INT = (SELECT id FROM Perfis WHERE nome = N'Administrador');
                DECLARE @func_id INT = (SELECT id FROM Funcionalidades WHERE chave = N'empresas');
                IF @admin_id IS NOT NULL AND @func_id IS NOT NULL
                BEGIN
                    INSERT INTO PerfilFuncionalidades (perfil_id, funcionalidade_id) VALUES (@admin_id, @func_id);
                END
            END

            -- Seed default partner companies if empty
            IF NOT EXISTS (SELECT * FROM EmpresasParceiras)
            BEGIN
                INSERT INTO EmpresasParceiras (nome, cnpj) VALUES 
                (N'Tech Solutions Ltda', N'12.345.678/0001-90'),
                (N'Global Outsourcing S.A.', N'98.765.432/0001-10');
            END

            -- Seed default outsourced collaborators if empty
            IF NOT EXISTS (SELECT * FROM ColaboradoresTerceirizados)
            BEGIN
                DECLARE @tech_id INT = (SELECT id FROM EmpresasParceiras WHERE nome = N'Tech Solutions Ltda');
                DECLARE @global_id INT = (SELECT id FROM EmpresasParceiras WHERE nome = N'Global Outsourcing S.A.');

                IF @tech_id IS NOT NULL
                BEGIN
                    INSERT INTO ColaboradoresTerceirizados (empresa_id, cpf, nome, email, cargo) VALUES
                    (@tech_id, N'111.222.333-44', N'Lucas Oliveira', N'lucas.oliveira@techsolutions.com', N'Desenvolvedor Frontend Terceirizado'),
                    (@tech_id, N'222.333.444-55', N'Mariana Santos', N'mariana.santos@techsolutions.com', N'QA Engineer Terceirizado');
                END

                IF @global_id IS NOT NULL
                BEGIN
                    INSERT INTO ColaboradoresTerceirizados (empresa_id, cpf, nome, email, cargo) VALUES
                    (@global_id, N'333.444.555-66', N'Rodrigo Lima', N'rodrigo.lima@globalout.com', N'Analista de Suporte Terceirizado');
                END
            END
        `);
        console.log('Database schemas verified/created successfully.');

        app.listen(port, () => {
            console.log(`Task Management server is running on http://localhost:${port}`);
        });
    } catch (err) {
        console.error('Fatal: Could not start server because database connection failed or schema verification failed.', err);
        process.exit(1);
    }
}

startServer();

