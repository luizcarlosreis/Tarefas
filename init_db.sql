-- 1. DATABASE CREATION
IF NOT EXISTS (SELECT name FROM sys.databases WHERE name = 'ControleTarefas')
BEGIN
    CREATE DATABASE ControleTarefas;
END
GO

USE ControleTarefas;
GO

-- 2. CREATE LOGIN AND USER (IF NOT EXISTS)
-- Create Login in master database
IF NOT EXISTS (SELECT name FROM sys.server_principals WHERE name = 'tarefas_user')
BEGIN
    CREATE LOGIN tarefas_user WITH PASSWORD = 'TarefasPass123!', DEFAULT_DATABASE = ControleTarefas, CHECK_POLICY = OFF;
END
GO

-- Create User in the ControleTarefas database
IF NOT EXISTS (SELECT name FROM sys.database_principals WHERE name = 'tarefas_user')
BEGIN
    CREATE USER tarefas_user FOR LOGIN tarefas_user;
    ALTER ROLE db_owner ADD MEMBER tarefas_user;
END
GO

-- 3. SCHEMA CREATION (TABLES)

-- Gerencias (Managements)
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'Gerencias')
BEGIN
    CREATE TABLE Gerencias (
        id INT IDENTITY(1,1) PRIMARY KEY,
        nome NVARCHAR(100) NOT NULL,
        sigla NVARCHAR(20) NOT NULL
    );
END

-- Coordenadorias (Coordinations)
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'Coordenadorias')
BEGIN
    CREATE TABLE Coordenadorias (
        id INT IDENTITY(1,1) PRIMARY KEY,
        nome NVARCHAR(100) NOT NULL,
        sigla NVARCHAR(20) NOT NULL,
        gerencia_id INT FOREIGN KEY REFERENCES Gerencias(id) ON DELETE SET NULL
    );
END

-- Colaboradores (Collaborators)
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'Colaboradores')
BEGIN
    CREATE TABLE Colaboradores (
        id INT IDENTITY(1,1) PRIMARY KEY,
        nome NVARCHAR(150) NOT NULL,
        email NVARCHAR(150) NOT NULL,
        cargo NVARCHAR(100) NOT NULL,
        coordenadoria_id INT FOREIGN KEY REFERENCES Coordenadorias(id) ON DELETE SET NULL
    );
END

-- Projetos (Projects)
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'Projetos')
BEGIN
    CREATE TABLE Projetos (
        id INT IDENTITY(1,1) PRIMARY KEY,
        nome NVARCHAR(200) NOT NULL,
        descricao NVARCHAR(MAX),
        data_inicio DATE NOT NULL,
        data_fim DATE,
        coordenadoria_id INT FOREIGN KEY REFERENCES Coordenadorias(id) ON DELETE SET NULL,
        status NVARCHAR(50) DEFAULT N'Em Andamento' -- 'Planejado', 'Em Andamento', 'Concluído', 'Pendente'
    );
END

-- ColaboradorProjetos (Junction table Collaborators <-> Projects)
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'ColaboradorProjetos')
BEGIN
    CREATE TABLE ColaboradorProjetos (
        colaborador_id INT NOT NULL FOREIGN KEY REFERENCES Colaboradores(id) ON DELETE CASCADE,
        projeto_id INT NOT NULL FOREIGN KEY REFERENCES Projetos(id) ON DELETE CASCADE,
        PRIMARY KEY (colaborador_id, projeto_id)
    );
END

-- Tarefas (Tasks)
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'Tarefas')
BEGIN
    CREATE TABLE Tarefas (
        id INT IDENTITY(1,1) PRIMARY KEY,
        projeto_id INT NOT NULL FOREIGN KEY REFERENCES Projetos(id) ON DELETE CASCADE,
        titulo NVARCHAR(200) NOT NULL,
        descricao NVARCHAR(MAX),
        status NVARCHAR(50) DEFAULT N'A Fazer', -- 'A Fazer', 'Em Progresso', 'Concluída'
        prioridade NVARCHAR(50) DEFAULT N'Média', -- 'Baixa', 'Média', 'Alta'
        data_entrega DATE,
        horas_estimadas DECIMAL(5,2) DEFAULT 0,
        horas_trabalhadas DECIMAL(5,2) DEFAULT 0,
        colaborador_id INT FOREIGN KEY REFERENCES Colaboradores(id) ON DELETE SET NULL
    );
END

-- SubTarefas (Subtasks)
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'SubTarefas')
BEGIN
    CREATE TABLE SubTarefas (
        id INT IDENTITY(1,1) PRIMARY KEY,
        tarefa_id INT NOT NULL FOREIGN KEY REFERENCES Tarefas(id) ON DELETE CASCADE,
        titulo NVARCHAR(200) NOT NULL,
        concluida BIT DEFAULT 0,
        colaborador_id INT FOREIGN KEY REFERENCES Colaboradores(id) ON DELETE SET NULL
    );
END

-- Apontamentos (Time logs/Activity logs)
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'Apontamentos')
BEGIN
    CREATE TABLE Apontamentos (
        id INT IDENTITY(1,1) PRIMARY KEY,
        colaborador_id INT NOT NULL FOREIGN KEY REFERENCES Colaboradores(id) ON DELETE CASCADE,
        projeto_id INT NOT NULL FOREIGN KEY REFERENCES Projetos(id) ON DELETE NO ACTION,
        tarefa_id INT NOT NULL FOREIGN KEY REFERENCES Tarefas(id) ON DELETE CASCADE,
        subtarefa_id INT NULL FOREIGN KEY REFERENCES SubTarefas(id) ON DELETE NO ACTION,
        data_apontamento DATE NOT NULL,
        horas DECIMAL(5,2) NULL,
        descricao NVARCHAR(MAX) NOT NULL
    );
END

-- MesesFechamento (Closing Months)
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'MesesFechamento')
BEGIN
    CREATE TABLE MesesFechamento (
        id INT IDENTITY(1,1) PRIMARY KEY,
        descricao NVARCHAR(200) NOT NULL,
        data_inicio DATE NOT NULL,
        data_fim DATE NOT NULL
    );
END
GO

-- 4. SEED INITIAL MOCK DATA (IF TABLES ARE EMPTY)

-- Seed Gerencias
IF NOT EXISTS (SELECT * FROM Gerencias)
BEGIN
    INSERT INTO Gerencias (nome, sigla) VALUES
    (N'Gerência de Tecnologia da Informação', N'GERTI'),
    (N'Gerência de Operações e Infraestrutura', N'GEROP'),
    (N'Gerência de Projetos Estratégicos', N'GERPRO');
END

-- Seed Coordenadorias
IF NOT EXISTS (SELECT * FROM Coordenadorias)
BEGIN
    DECLARE @gerti INT = (SELECT id FROM Gerencias WHERE sigla = N'GERTI');
    DECLARE @gerop INT = (SELECT id FROM Gerencias WHERE sigla = N'GEROP');

    INSERT INTO Coordenadorias (nome, sigla, gerencia_id) VALUES
    (N'Coordenadoria de Sistemas de Informação', N'COSIS', @gerti),
    (N'Coordenadoria de Infraestrutura e Redes', N'COINF', @gerop),
    (N'Coordenadoria de Suporte e Atendimento', N'COSUP', @gerop),
    (N'Coordenadoria de Segurança da Informação', N'COSEG', @gerti);
END

-- Seed Colaboradores
IF NOT EXISTS (SELECT * FROM Colaboradores)
BEGIN
    DECLARE @cosis INT = (SELECT id FROM Coordenadorias WHERE sigla = N'COSIS');
    DECLARE @coinf INT = (SELECT id FROM Coordenadorias WHERE sigla = N'COINF');
    DECLARE @cosup INT = (SELECT id FROM Coordenadorias WHERE sigla = N'COSUP');
    DECLARE @coseg INT = (SELECT id FROM Coordenadorias WHERE sigla = N'COSEG');

    INSERT INTO Colaboradores (nome, email, cargo, coordenadoria_id) VALUES
    (N'Ana Silva', N'ana.silva@empresa.com', N'Analista de Sistemas Pleno', @cosis),
    (N'Bruno Souza', N'bruno.souza@empresa.com', N'Desenvolvedor Senior', @cosis),
    (N'Carlos Santos', N'carlos.santos@empresa.com', N'Administrador de Banco de Dados', @cosis),
    (N'Diana Oliveira', N'diana.oliveira@empresa.com', N'Analista de Infraestrutura', @coinf),
    (N'Eduardo Lima', N'eduardo.lima@empresa.com', N'Coordenador de Redes', @coinf),
    (N'Fernanda Costa', N'fernanda.costa@empresa.com', N'Analista de Suporte', @cosup),
    (N'Gabriel Ferreira', N'gabriel.ferreira@empresa.com', N'Especialista em Segurança', @coseg);
END

-- Seed Projetos
IF NOT EXISTS (SELECT * FROM Projetos)
BEGIN
    DECLARE @cosis_id INT = (SELECT id FROM Coordenadorias WHERE sigla = N'COSIS');
    DECLARE @coinf_id INT = (SELECT id FROM Coordenadorias WHERE sigla = N'COINF');
    DECLARE @coseg_id INT = (SELECT id FROM Coordenadorias WHERE sigla = N'COSEG');

    INSERT INTO Projetos (nome, descricao, data_inicio, data_fim, coordenadoria_id, status) VALUES
    (N'Novo Sistema de Ouvidoria', N'Desenvolvimento de uma nova plataforma web para receber sugestões, críticas e elogios dos usuários.', '2026-05-01', '2026-10-31', @cosis_id, N'Em Andamento'),
    (N'Migração para Cloud Server', N'Migração dos servidores locais para infraestrutura em nuvem na Azure, otimizando custos e alta disponibilidade.', '2026-06-01', '2026-08-30', @coinf_id, N'Em Andamento'),
    (N'Auditoria de Segurança 2026', N'Revisão completa das credenciais, acessos e patches de segurança em todos os sistemas corporativos.', '2026-06-01', '2026-07-15', @coseg_id, N'Em Andamento');
END

-- Seed Tarefas
IF NOT EXISTS (SELECT * FROM Tarefas)
BEGIN
    DECLARE @proj_ouvidoria INT = (SELECT id FROM Projetos WHERE nome = N'Novo Sistema de Ouvidoria');
    DECLARE @proj_cloud INT = (SELECT id FROM Projetos WHERE nome = N'Migração para Cloud Server');
    DECLARE @proj_auditoria INT = (SELECT id FROM Projetos WHERE nome = N'Auditoria de Segurança 2026');

    DECLARE @colab_ana INT = (SELECT id FROM Colaboradores WHERE nome = N'Ana Silva');
    DECLARE @colab_bruno INT = (SELECT id FROM Colaboradores WHERE nome = N'Bruno Souza');
    DECLARE @colab_carlos INT = (SELECT id FROM Colaboradores WHERE nome = N'Carlos Santos');
    DECLARE @colab_diana INT = (SELECT id FROM Colaboradores WHERE nome = N'Diana Oliveira');
    DECLARE @colab_gabriel INT = (SELECT id FROM Colaboradores WHERE nome = N'Gabriel Ferreira');

    -- Ouvidoria Tasks
    INSERT INTO Tarefas (projeto_id, titulo, descricao, status, prioridade, data_entrega, horas_estimadas, horas_trabalhadas, colaborador_id) VALUES
    (@proj_ouvidoria, N'Modelagem do Banco de Dados', N'Criar o modelo relacional no SQL Server, definir tabelas de chamados, usuários e categorias.', N'Concluída', N'Alta', '2026-05-15', 24.0, 26.0, @colab_carlos),
    (@proj_ouvidoria, N'Desenvolvimento das APIs Backend', N'Criar rotas de CRUD em Node.js com Express para cadastrar chamados.', N'Em Progresso', N'Alta', '2026-06-30', 60.0, 32.0, @colab_bruno),
    (@proj_ouvidoria, N'Criação do Painel do Usuário (Frontend)', N'Desenvolver a interface web responsiva para que o cidadão abra os chamados.', N'A Fazer', N'Média', '2026-07-20', 40.0, 0.0, @colab_ana);

    -- Cloud Tasks
    INSERT INTO Tarefas (projeto_id, titulo, descricao, status, prioridade, data_entrega, horas_estimadas, horas_trabalhadas, colaborador_id) VALUES
    (@proj_cloud, N'Inventário de Servidores Atuais', N'Listar todos os serviços ativos locais, consumo de CPU, memória e armazenamento.', N'Concluída', N'Média', '2026-06-10', 16.0, 18.0, @colab_diana),
    (@proj_cloud, N'Configuração da VPC e Firewalls na Azure', N'Configurar redes virtuais, subnets corporativas e regras de acesso de entrada/saída.', N'Em Progresso', N'Alta', '2026-06-25', 30.0, 12.0, @colab_diana);

    -- Auditoria Tasks
    INSERT INTO Tarefas (projeto_id, titulo, descricao, status, prioridade, data_entrega, horas_estimadas, horas_trabalhadas, colaborador_id) VALUES
    (@proj_auditoria, N'Revisão de Permissões no Active Directory', N'Varredura de contas inativas há mais de 90 dias e grupos de privilégios elevados.', N'Em Progresso', N'Alta', '2026-06-20', 20.0, 8.0, @colab_gabriel);
END

-- Seed SubTarefas
IF NOT EXISTS (SELECT * FROM SubTarefas)
BEGIN
    DECLARE @tar_modelagem INT = (SELECT id FROM Tarefas WHERE titulo = N'Modelagem do Banco de Dados');
    DECLARE @tar_backend INT = (SELECT id FROM Tarefas WHERE titulo = N'Desenvolvimento das APIs Backend');
    DECLARE @tar_inventario INT = (SELECT id FROM Tarefas WHERE titulo = N'Inventário de Servidores Atuais');

    DECLARE @colab_carlos_sub INT = (SELECT id FROM Colaboradores WHERE nome = N'Carlos Santos');
    DECLARE @colab_bruno_sub INT = (SELECT id FROM Colaboradores WHERE nome = N'Bruno Souza');
    DECLARE @colab_diana_sub INT = (SELECT id FROM Colaboradores WHERE nome = N'Diana Oliveira');

    -- Subtasks for Modelagem
    INSERT INTO SubTarefas (tarefa_id, titulo, concluida, colaborador_id) VALUES
    (@tar_modelagem, N'Esboço do Diagrama Entidade-Relacionamento', 1, @colab_carlos_sub),
    (@tar_modelagem, N'Validação dos tipos de dados e chaves estrangeiras', 1, @colab_carlos_sub),
    (@tar_modelagem, N'Geração e execução do script DDL de tabelas', 1, @colab_carlos_sub);

    -- Subtasks for Backend
    INSERT INTO SubTarefas (tarefa_id, titulo, concluida, colaborador_id) VALUES
    (@tar_backend, N'Configuração da conexão com SQL Server via node-mssql', 1, @colab_bruno_sub),
    (@tar_backend, N'Codificação das rotas de autenticação (JWT)', 0, @colab_bruno_sub),
    (@tar_backend, N'Codificação das rotas de chamados e upload de anexos', 0, @colab_bruno_sub);

    -- Subtasks for Inventário
    INSERT INTO SubTarefas (tarefa_id, titulo, concluida, colaborador_id) VALUES
    (@tar_inventario, N'Execução de scripts PowerShell nos Hyper-V', 1, @colab_diana_sub),
    (@tar_inventario, N'Preenchimento da planilha consolidada de ativos', 1, @colab_diana_sub);
END

-- Seed MesesFechamento
IF NOT EXISTS (SELECT * FROM MesesFechamento)
BEGIN
    INSERT INTO MesesFechamento (descricao, data_inicio, data_fim) VALUES
    (N'Fechamento Maio/2026', '2026-05-01', '2026-05-31'),
    (N'Fechamento Junho/2026', '2026-06-01', '2026-06-30'),
    (N'Fechamento Julho/2026', '2026-07-01', '2026-07-31');
END
GO
