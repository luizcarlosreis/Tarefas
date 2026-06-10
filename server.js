const express = require('express');
const sql = require('mssql');
const path = require('path');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
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

// 1. DASHBOARD SUMMARY
app.get('/api/dashboard/summary', async (req, res) => {
    try {
        const query = `
            SELECT 
                (SELECT COUNT(*) FROM Projetos WHERE status = 'Em Andamento') as activeProjects,
                (SELECT COUNT(*) FROM Tarefas WHERE status = 'A Fazer' OR status = 'Em Progresso') as pendingTasks,
                (SELECT COUNT(*) FROM Colaboradores) as totalCollaborators,
                (SELECT COALESCE(SUM(horas_trabalhadas), 0) FROM Tarefas) as totalHoursWorked
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
        const result = await pool.request().query('SELECT * FROM Gerencias ORDER BY nome');
        res.json(result.recordset);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/gerencias', async (req, res) => {
    const { nome, sigla } = req.body;
    try {
        const result = await pool.request()
            .input('nome', sql.NVarChar, nome)
            .input('sigla', sql.NVarChar, sigla)
            .query('INSERT INTO Gerencias (nome, sigla) OUTPUT INSERTED.* VALUES (@nome, @sigla)');
        res.status(201).json(result.recordset[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.put('/api/gerencias/:id', async (req, res) => {
    const { id } = req.params;
    const { nome, sigla } = req.body;
    try {
        const result = await pool.request()
            .input('id', sql.Int, id)
            .input('nome', sql.NVarChar, nome)
            .input('sigla', sql.NVarChar, sigla)
            .query(`
                UPDATE Gerencias
                SET nome = @nome, sigla = @sigla
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
            SELECT c.*, g.sigla as gerencia_sigla, g.nome as gerencia_nome
            FROM Coordenadorias c
            LEFT JOIN Gerencias g ON c.gerencia_id = g.id
            ORDER BY c.nome
        `;
        const result = await pool.request().query(query);
        res.json(result.recordset);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/coordenadorias', async (req, res) => {
    const { nome, sigla, gerencia_id } = req.body;
    try {
        const result = await pool.request()
            .input('nome', sql.NVarChar, nome)
            .input('sigla', sql.NVarChar, sigla)
            .input('gerencia_id', sql.Int, gerencia_id || null)
            .query('INSERT INTO Coordenadorias (nome, sigla, gerencia_id) OUTPUT INSERTED.* VALUES (@nome, @sigla, @gerencia_id)');
        res.status(201).json(result.recordset[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.put('/api/coordenadorias/:id', async (req, res) => {
    const { id } = req.params;
    const { nome, sigla, gerencia_id } = req.body;
    try {
        const result = await pool.request()
            .input('id', sql.Int, id)
            .input('nome', sql.NVarChar, nome)
            .input('sigla', sql.NVarChar, sigla)
            .input('gerencia_id', sql.Int, gerencia_id || null)
            .query(`
                UPDATE Coordenadorias
                SET nome = @nome, sigla = @sigla, gerencia_id = @gerencia_id
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
        const query = `
            SELECT c.*, coord.sigla as coordenadoria_sigla, coord.nome as coordenadoria_nome 
            FROM Colaboradores c
            LEFT JOIN Coordenadorias coord ON c.coordenadoria_id = coord.id
            ORDER BY c.nome
        `;
        const result = await pool.request().query(query);
        res.json(result.recordset);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/colaboradores', async (req, res) => {
    const { nome, email, cargo, coordenadoria_id } = req.body;
    try {
        const result = await pool.request()
            .input('nome', sql.NVarChar, nome)
            .input('email', sql.NVarChar, email)
            .input('cargo', sql.NVarChar, cargo)
            .input('coordenadoria_id', sql.Int, coordenadoria_id || null)
            .query(`
                INSERT INTO Colaboradores (nome, email, cargo, coordenadoria_id) 
                OUTPUT INSERTED.* 
                VALUES (@nome, @email, @cargo, @coordenadoria_id)
            `);
        res.status(201).json(result.recordset[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.put('/api/colaboradores/:id', async (req, res) => {
    const { id } = req.params;
    const { nome, email, cargo, coordenadoria_id } = req.body;
    try {
        const result = await pool.request()
            .input('id', sql.Int, id)
            .input('nome', sql.NVarChar, nome)
            .input('email', sql.NVarChar, email)
            .input('cargo', sql.NVarChar, cargo)
            .input('coordenadoria_id', sql.Int, coordenadoria_id || null)
            .query(`
                UPDATE Colaboradores
                SET nome = @nome, email = @email, cargo = @cargo, coordenadoria_id = @coordenadoria_id
                OUTPUT INSERTED.*
                WHERE id = @id
            `);
        res.json(result.recordset[0]);
    } catch (err) {
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

// 4. PROJECTS (PROJETOS)
app.get('/api/projetos', async (req, res) => {
    try {
        const query = `
            SELECT p.*, coord.sigla as coordenadoria_sigla,
                   (SELECT COUNT(*) FROM Tarefas WHERE projeto_id = p.id) as total_tasks,
                   (SELECT COUNT(*) FROM Tarefas WHERE projeto_id = p.id AND status = 'Concluída') as completed_tasks
            FROM Projetos p
            LEFT JOIN Coordenadorias coord ON p.coordenadoria_id = coord.id
            ORDER BY p.data_inicio DESC
        `;
        const result = await pool.request().query(query);
        res.json(result.recordset);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/projetos', async (req, res) => {
    const { nome, descricao, data_inicio, data_fim, coordenadoria_id, status } = req.body;
    try {
        const result = await pool.request()
            .input('nome', sql.VarChar, nome)
            .input('descricao', sql.VarChar, descricao || null)
            .input('data_inicio', sql.Date, data_inicio)
            .input('data_fim', sql.Date, data_fim || null)
            .input('coordenadoria_id', sql.Int, coordenadoria_id || null)
            .input('status', sql.VarChar, status || 'Em Andamento')
            .query(`
                INSERT INTO Projetos (nome, descricao, data_inicio, data_fim, coordenadoria_id, status) 
                OUTPUT INSERTED.* 
                VALUES (@nome, @descricao, @data_inicio, @data_fim, @coordenadoria_id, @status)
            `);
        res.status(201).json(result.recordset[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.put('/api/projetos/:id', async (req, res) => {
    const { id } = req.params;
    const { nome, descricao, data_inicio, data_fim, coordenadoria_id, status } = req.body;
    try {
        const result = await pool.request()
            .input('id', sql.Int, id)
            .input('nome', sql.VarChar, nome)
            .input('descricao', sql.VarChar, descricao || null)
            .input('data_inicio', sql.Date, data_inicio)
            .input('data_fim', sql.Date, data_fim || null)
            .input('coordenadoria_id', sql.Int, coordenadoria_id || null)
            .input('status', sql.VarChar, status)
            .query(`
                UPDATE Projetos 
                SET nome = @nome, descricao = @descricao, data_inicio = @data_inicio, 
                    data_fim = @data_fim, coordenadoria_id = @coordenadoria_id, status = @status
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
        const query = `
            SELECT t.*, p.nome as projeto_nome, c.nome as colaborador_nome, c.email as colaborador_email
            FROM Tarefas t
            JOIN Projetos p ON t.projeto_id = p.id
            LEFT JOIN Colaboradores c ON t.colaborador_id = c.id
            ORDER BY t.data_entrega ASC
        `;
        const result = await pool.request().query(query);
        res.json(result.recordset);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/tarefas', async (req, res) => {
    const { projeto_id, titulo, descricao, status, prioridade, data_entrega, horas_estimadas, horas_trabalhadas, colaborador_id } = req.body;
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
            .query(`
                INSERT INTO Tarefas (projeto_id, titulo, descricao, status, prioridade, data_entrega, horas_estimadas, horas_trabalhadas, colaborador_id)
                OUTPUT INSERTED.*
                VALUES (@projeto_id, @titulo, @descricao, @status, @prioridade, @data_entrega, @horas_estimadas, @horas_trabalhadas, @colaborador_id)
            `);
        res.status(201).json(result.recordset[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.put('/api/tarefas/:id', async (req, res) => {
    const { id } = req.params;
    const { projeto_id, titulo, descricao, status, prioridade, data_entrega, horas_estimadas, horas_trabalhadas, colaborador_id } = req.body;
    try {
        const result = await pool.request()
            .input('id', sql.Int, id)
            .input('projeto_id', sql.Int, projeto_id)
            .input('titulo', sql.NVarChar, titulo)
            .input('descricao', sql.NVarChar, descricao || null)
            .input('status', sql.NVarChar, status)
            .input('horas_trabalhadas', sql.Decimal(5, 2), horas_trabalhadas || 0)
            .input('colaborador_id', sql.Int, colaborador_id || null)
            .input('prioridade', sql.NVarChar, prioridade)
            .input('data_entrega', sql.Date, data_entrega || null)
            .input('horas_estimadas', sql.Decimal(5, 2), horas_estimadas || 0)
            .query(`
                UPDATE Tarefas
                SET projeto_id = @projeto_id, titulo = @titulo, descricao = @descricao, 
                    status = @status, prioridade = @prioridade, data_entrega = @data_entrega, 
                    horas_estimadas = @horas_estimadas, horas_trabalhadas = @horas_trabalhadas, 
                    colaborador_id = @colaborador_id
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
            .query('SELECT s.*, c.nome as colaborador_nome FROM SubTarefas s LEFT JOIN Colaboradores c ON s.colaborador_id = c.id WHERE s.tarefa_id = @tarefa_id');
        res.json(result.recordset);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/subtarefas', async (req, res) => {
    const { tarefa_id, titulo, concluida, colaborador_id } = req.body;
    try {
        const result = await pool.request()
            .input('tarefa_id', sql.Int, tarefa_id)
            .input('titulo', sql.NVarChar, titulo)
            .input('concluida', sql.Bit, concluida ? 1 : 0)
            .input('colaborador_id', sql.Int, colaborador_id || null)
            .query(`
                INSERT INTO SubTarefas (tarefa_id, titulo, concluida, colaborador_id)
                OUTPUT INSERTED.*
                VALUES (@tarefa_id, @titulo, @concluida, @colaborador_id)
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
    const { titulo, concluida, colaborador_id } = req.body;
    try {
        const result = await pool.request()
            .input('id', sql.Int, id)
            .input('titulo', sql.NVarChar, titulo)
            .input('concluida', sql.Bit, concluida ? 1 : 0)
            .input('colaborador_id', sql.Int, colaborador_id || null)
            .query(`
                UPDATE SubTarefas
                SET titulo = @titulo, concluida = @concluida, colaborador_id = @colaborador_id
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
    const { mes, ano } = req.query;
    if (!mes || !ano) {
        return res.status(400).json({ error: 'Month (mes) and Year (ano) parameters are required.' });
    }

    try {
        // Query Project Aggregates for the Month
        const queryProjetos = `
            SELECT 
                p.id as projeto_id,
                p.nome as projeto_nome,
                coord.sigla as coordenadoria_sigla,
                COUNT(t.id) as total_tarefas,
                SUM(CASE WHEN t.status = 'Concluída' THEN 1 ELSE 0 END) as tarefas_concluidas,
                SUM(t.horas_estimadas) as total_horas_estimadas,
                SUM(t.horas_trabalhadas) as total_horas_trabalhadas,
                COUNT(DISTINCT t.colaborador_id) as colaboradores_alocados
            FROM Projetos p
            LEFT JOIN Coordenadorias coord ON p.coordenadoria_id = coord.id
            JOIN Tarefas t ON t.projeto_id = p.id
            WHERE YEAR(t.data_entrega) = @ano AND MONTH(t.data_entrega) = @mes
            GROUP BY p.id, p.nome, coord.sigla
            ORDER BY p.nome
        `;

        // Query Collaborator Aggregates for the Month
        const queryColaboradores = `
            SELECT 
                c.id as colaborador_id,
                c.nome as colaborador_nome,
                coord.sigla as coordenadoria_sigla,
                COUNT(t.id) as total_tarefas,
                SUM(CASE WHEN t.status = 'Concluída' THEN 1 ELSE 0 END) as tarefas_concluidas,
                SUM(t.horas_trabalhadas) as total_horas_trabalhadas,
                COUNT(DISTINCT t.projeto_id) as total_projetos
            FROM Colaboradores c
            LEFT JOIN Coordenadorias coord ON c.coordenadoria_id = coord.id
            JOIN Tarefas t ON t.colaborador_id = c.id
            WHERE YEAR(t.data_entrega) = @ano AND MONTH(t.data_entrega) = @mes
            GROUP BY c.id, c.nome, coord.sigla
            ORDER BY c.nome
        `;

        const request = pool.request()
            .input('mes', sql.Int, mes)
            .input('ano', sql.Int, ano);

        const resProjetos = await request.query(queryProjetos);
        
        // Recreate request because parameters cannot be bound twice in the same execution context
        const request2 = pool.request()
            .input('mes', sql.Int, mes)
            .input('ano', sql.Int, ano);
        const resColaboradores = await request2.query(queryColaboradores);

        res.json({
            projetos: resProjetos.recordset,
            colaboradores: resColaboradores.recordset
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// SPA Route: fallback to index.html
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start Server
async function startServer() {
    try {
        await connectDB();
        app.listen(port, () => {
            console.log(`Task Management server is running on http://localhost:${port}`);
        });
    } catch (err) {
        console.error('Fatal: Could not start server because database connection failed.', err);
        process.exit(1);
    }
}

startServer();

