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
        sigla NVARCHAR(20) NOT NULL,
        responsavel_id INT NULL
    );
END

-- Coordenadorias (Coordinations)
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'Coordenadorias')
BEGIN
    CREATE TABLE Coordenadorias (
        id INT IDENTITY(1,1) PRIMARY KEY,
        nome NVARCHAR(100) NOT NULL,
        sigla NVARCHAR(20) NOT NULL,
        gerencia_id INT FOREIGN KEY REFERENCES Gerencias(id) ON DELETE SET NULL,
        coordenador_id INT NULL
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
        gerencia_id INT NOT NULL FOREIGN KEY REFERENCES Gerencias(id) ON DELETE NO ACTION,
        coordenadoria_id INT FOREIGN KEY REFERENCES Coordenadorias(id) ON DELETE SET NULL,
        cpf NVARCHAR(14) NULL,
        senha NVARCHAR(100) NULL
    );
END
GO

-- EmpresasParceiras (Partner Companies)
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'EmpresasParceiras')
BEGIN
    CREATE TABLE EmpresasParceiras (
        id INT IDENTITY(1,1) PRIMARY KEY,
        nome NVARCHAR(150) NOT NULL,
        cnpj NVARCHAR(18) NOT NULL UNIQUE
    );
END

-- ColaboradoresTerceirizados (Outsourced Collaborators)
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
GO


-- Projetos (Projects)
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'Projetos')
BEGIN
    CREATE TABLE Projetos (
        id INT IDENTITY(1,1) PRIMARY KEY,
        nome NVARCHAR(200) NOT NULL,
        descricao NVARCHAR(MAX),
        data_inicio DATE NOT NULL,
        data_fim DATE,
        gerencia_id INT NOT NULL FOREIGN KEY REFERENCES Gerencias(id) ON DELETE NO ACTION,
        coordenadoria_id INT FOREIGN KEY REFERENCES Coordenadorias(id) ON DELETE SET NULL,
        status NVARCHAR(50) DEFAULT N'Em Andamento' -- 'Planejado', 'Em Andamento', 'Concluído', 'Pendente'
    );
END

-- Solicitantes (Requesters)
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'Solicitantes')
BEGIN
    CREATE TABLE Solicitantes (
        id INT IDENTITY(1,1) PRIMARY KEY,
        nome NVARCHAR(150) NOT NULL,
        setor NVARCHAR(100) NOT NULL
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
        colaborador_id INT FOREIGN KEY REFERENCES Colaboradores(id) ON DELETE SET NULL,
        solicitante_id INT FOREIGN KEY REFERENCES Solicitantes(id) ON DELETE SET NULL
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
        colaborador_id INT FOREIGN KEY REFERENCES Colaboradores(id) ON DELETE SET NULL,
        colaborador_terceirizado_id INT FOREIGN KEY REFERENCES ColaboradoresTerceirizados(id) ON DELETE SET NULL
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
        data_fim DATE NOT NULL,
        ativo BIT NOT NULL DEFAULT 0
    );
END

-- Perfis (Profiles)
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'Perfis')
BEGIN
    CREATE TABLE Perfis (
        id INT IDENTITY(1,1) PRIMARY KEY,
        nome NVARCHAR(100) NOT NULL UNIQUE
    );
END

-- ColaboradorPerfis (Collaborator-Profile Join Table)
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'ColaboradorPerfis')
BEGIN
    CREATE TABLE ColaboradorPerfis (
        colaborador_id INT NOT NULL FOREIGN KEY REFERENCES Colaboradores(id) ON DELETE CASCADE,
        perfil_id INT NOT NULL FOREIGN KEY REFERENCES Perfis(id) ON DELETE CASCADE,
        PRIMARY KEY (colaborador_id, perfil_id)
    );
END

-- Funcionalidades (Functionalities)
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'Funcionalidades')
BEGIN
    CREATE TABLE Funcionalidades (
        id INT IDENTITY(1,1) PRIMARY KEY,
        nome NVARCHAR(100) NOT NULL,
        chave NVARCHAR(100) NOT NULL UNIQUE
    );
END

-- PerfilFuncionalidades (Profile-Functionalities Join Table)
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'PerfilFuncionalidades')
BEGIN
    CREATE TABLE PerfilFuncionalidades (
        perfil_id INT NOT NULL FOREIGN KEY REFERENCES Perfis(id) ON DELETE CASCADE,
        funcionalidade_id INT NOT NULL FOREIGN KEY REFERENCES Funcionalidades(id) ON DELETE CASCADE,
        PRIMARY KEY (perfil_id, funcionalidade_id)
END
GO


-- Add circular relationship foreign key for Coordenadorias <-> Colaboradores
IF NOT EXISTS (SELECT * FROM sys.foreign_keys WHERE name = 'FK_Coordenadorias_Colaboradores')
BEGIN
    ALTER TABLE Coordenadorias ADD CONSTRAINT FK_Coordenadorias_Colaboradores 
    FOREIGN KEY (coordenador_id) REFERENCES Colaboradores(id) ON DELETE SET NULL;
END
GO

-- Add circular relationship foreign key for Gerencias <-> Colaboradores
IF NOT EXISTS (SELECT * FROM sys.foreign_keys WHERE name = 'FK_Gerencias_Colaboradores')
BEGIN
    ALTER TABLE Gerencias ADD CONSTRAINT FK_Gerencias_Colaboradores 
    FOREIGN KEY (responsavel_id) REFERENCES Colaboradores(id) ON DELETE SET NULL;
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
    DECLARE @gerti INT = (SELECT id FROM Gerencias WHERE sigla = N'GERTI');
    DECLARE @gerop INT = (SELECT id FROM Gerencias WHERE sigla = N'GEROP');

    DECLARE @cosis INT = (SELECT id FROM Coordenadorias WHERE sigla = N'COSIS');
    DECLARE @coinf INT = (SELECT id FROM Coordenadorias WHERE sigla = N'COINF');
    DECLARE @cosup INT = (SELECT id FROM Coordenadorias WHERE sigla = N'COSUP');
    DECLARE @coseg INT = (SELECT id FROM Coordenadorias WHERE sigla = N'COSEG');

    INSERT INTO Colaboradores (nome, email, cargo, gerencia_id, coordenadoria_id, cpf, senha) VALUES
    (N'Administrador do Sistema', N'admin@empresa.com', N'Administrador do Sistema', @gerti, @cosis, N'000.000.000-00', N'admin'),
    (N'Ana Silva', N'ana.silva@empresa.com', N'Analista de Sistemas Pleno', @gerti, @cosis, N'333.333.333-33', N'123'),
    (N'Bruno Souza', N'bruno.souza@empresa.com', N'Desenvolvedor Senior', @gerti, @cosis, N'111.111.111-11', N'123'),
    (N'Carlos Santos', N'carlos.santos@empresa.com', N'Administrador de Banco de Dados', @gerti, @cosis, N'444.444.444-44', N'123'),
    (N'Diana Oliveira', N'diana.oliveira@empresa.com', N'Analista de Infraestrutura', @gerop, @coinf, N'222.222.222-22', N'123'),
    (N'Eduardo Lima', N'eduardo.lima@empresa.com', N'Coordenador de Redes', @gerop, @coinf, N'555.555.555-55', N'123'),
    (N'Fernanda Costa', N'fernanda.costa@empresa.com', N'Analista de Suporte', @gerop, @cosup, N'666.666.666-66', N'123'),
    (N'Gabriel Ferreira', N'gabriel.ferreira@empresa.com', N'Especialista em Segurança', @gerti, @coseg, N'777.777.777-77', N'123');
END

-- Seed Projetos
IF NOT EXISTS (SELECT * FROM Projetos)
BEGIN
    DECLARE @gerti INT = (SELECT id FROM Gerencias WHERE sigla = N'GERTI');
    DECLARE @gerop INT = (SELECT id FROM Gerencias WHERE sigla = N'GEROP');

    DECLARE @cosis_id INT = (SELECT id FROM Coordenadorias WHERE sigla = N'COSIS');
    DECLARE @coinf_id INT = (SELECT id FROM Coordenadorias WHERE sigla = N'COINF');
    DECLARE @coseg_id INT = (SELECT id FROM Coordenadorias WHERE sigla = N'COSEG');

    INSERT INTO Projetos (nome, descricao, data_inicio, data_fim, gerencia_id, coordenadoria_id, status) VALUES
    (N'Novo Sistema de Ouvidoria', N'Desenvolvimento de uma nova plataforma web para receber sugestões, críticas e elogios dos usuários.', '2026-05-01', '2026-10-31', @gerti, @cosis_id, N'Em Andamento'),
    (N'Migração para Cloud Server', N'Migração dos servidores locais para infraestrutura em nuvem na Azure, otimizando custos e alta disponibilidade.', '2026-06-01', '2026-08-30', @gerop, @coinf_id, N'Em Andamento'),
    (N'Auditoria de Segurança 2026', N'Revisão completa das credenciais, acessos e patches de segurança em todos os sistemas corporativos.', '2026-06-01', '2026-07-15', @gerti, @coseg_id, N'Em Andamento');
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

-- Seed Perfis
IF NOT EXISTS (SELECT * FROM Perfis)
BEGIN
    INSERT INTO Perfis (nome) VALUES
    (N'Administrador'),
    (N'Gerência'),
    (N'Coordenador'),
    (N'Apontador');
END

-- Seed Funcionalidades
IF NOT EXISTS (SELECT * FROM Funcionalidades)
BEGIN
    INSERT INTO Funcionalidades (nome, chave) VALUES
    (N'Painel Geral', N'painel-geral'),
    (N'Projetos', N'projetos'),
    (N'Tarefas', N'tarefas'),
    (N'Equipes (Gerencia, Coordenadoria e Colaboradores)', N'equipes'),
    (N'Solicitantes', N'solicitantes'),
    (N'Perfis', N'perfis'),
    (N'Fechamento Mensal', N'fechamento-mensal'),
    (N'Gerenciar Períodos', N'gerenciar-periodos'),
    (N'Apontamentos', N'apontamentos'),
    (N'Funcionalidades', N'funcionalidades'),
    (N'Empresas Parceiras', N'empresas');
END
GO

-- Seed ColaboradorPerfis (Link Collaborators to Profiles)
IF NOT EXISTS (SELECT * FROM ColaboradorPerfis)
BEGIN
    DECLARE @admin_perf INT = (SELECT id FROM Perfis WHERE nome = N'Administrador');
    DECLARE @ger_perf INT = (SELECT id FROM Perfis WHERE nome = N'Gerência');
    DECLARE @coord_perf INT = (SELECT id FROM Perfis WHERE nome = N'Coordenador');
    DECLARE @apont_perf INT = (SELECT id FROM Perfis WHERE nome = N'Apontador');

    DECLARE @colab_admin INT = (SELECT id FROM Colaboradores WHERE nome = N'Administrador do Sistema');
    DECLARE @colab_ana INT = (SELECT id FROM Colaboradores WHERE nome = N'Ana Silva');
    DECLARE @colab_bruno INT = (SELECT id FROM Colaboradores WHERE nome = N'Bruno Souza');
    DECLARE @colab_carlos INT = (SELECT id FROM Colaboradores WHERE nome = N'Carlos Santos');
    DECLARE @colab_diana INT = (SELECT id FROM Colaboradores WHERE nome = N'Diana Oliveira');
    DECLARE @colab_eduardo INT = (SELECT id FROM Colaboradores WHERE nome = N'Eduardo Lima');
    DECLARE @colab_fernanda INT = (SELECT id FROM Colaboradores WHERE nome = N'Fernanda Costa');
    DECLARE @colab_gabriel INT = (SELECT id FROM Colaboradores WHERE nome = N'Gabriel Ferreira');

    IF @colab_admin IS NOT NULL INSERT INTO ColaboradorPerfis (colaborador_id, perfil_id) VALUES (@colab_admin, @admin_perf);
    IF @colab_ana IS NOT NULL INSERT INTO ColaboradorPerfis (colaborador_id, perfil_id) VALUES (@colab_ana, @ger_perf);
    IF @colab_bruno IS NOT NULL INSERT INTO ColaboradorPerfis (colaborador_id, perfil_id) VALUES (@colab_bruno, @apont_perf);
    IF @colab_carlos IS NOT NULL INSERT INTO ColaboradorPerfis (colaborador_id, perfil_id) VALUES (@colab_carlos, @apont_perf);
    IF @colab_diana IS NOT NULL INSERT INTO ColaboradorPerfis (colaborador_id, perfil_id) VALUES (@colab_diana, @coord_perf);
    IF @colab_eduardo IS NOT NULL INSERT INTO ColaboradorPerfis (colaborador_id, perfil_id) VALUES (@colab_eduardo, @coord_perf);
    IF @colab_fernanda IS NOT NULL INSERT INTO ColaboradorPerfis (colaborador_id, perfil_id) VALUES (@colab_fernanda, @apont_perf);
    IF @colab_gabriel IS NOT NULL INSERT INTO ColaboradorPerfis (colaborador_id, perfil_id) VALUES (@colab_gabriel, @apont_perf);
END
GO

-- Seed PerfilFuncionalidades (Link Profiles to Functionalities)
IF NOT EXISTS (SELECT * FROM PerfilFuncionalidades)
BEGIN
    DECLARE @p_admin INT = (SELECT id FROM Perfis WHERE nome = N'Administrador');
    DECLARE @p_ger INT = (SELECT id FROM Perfis WHERE nome = N'Gerência');
    DECLARE @p_coord INT = (SELECT id FROM Perfis WHERE nome = N'Coordenador');
    DECLARE @p_apont INT = (SELECT id FROM Perfis WHERE nome = N'Apontador');

    -- Admin gets all functionalities
    INSERT INTO PerfilFuncionalidades (perfil_id, funcionalidade_id)
    SELECT @p_admin, id FROM Funcionalidades;

    -- Gerência gets: painel-geral, projetos, equipes, fechamento-mensal, apontamentos
    INSERT INTO PerfilFuncionalidades (perfil_id, funcionalidade_id)
    SELECT @p_ger, id FROM Funcionalidades WHERE chave IN (N'painel-geral', N'projetos', N'equipes', N'fechamento-mensal', N'apontamentos');

    -- Coordenador gets: painel-geral, projetos, tarefas, equipes, solicitantes, apontamentos
    INSERT INTO PerfilFuncionalidades (perfil_id, funcionalidade_id)
    SELECT @p_coord, id FROM Funcionalidades WHERE chave IN (N'painel-geral', N'projetos', N'tarefas', N'equipes', N'solicitantes', N'apontamentos');

    -- Apontador gets: apontamentos, tarefas
    INSERT INTO PerfilFuncionalidades (perfil_id, funcionalidade_id)
    SELECT @p_apont, id FROM Funcionalidades WHERE chave IN (N'apontamentos', N'tarefas');
END
GO

-- Seed EmpresasParceiras and ColaboradoresTerceirizados
IF NOT EXISTS (SELECT * FROM EmpresasParceiras)
BEGIN
    INSERT INTO EmpresasParceiras (nome, cnpj) VALUES 
    (N'Tech Solutions Ltda', N'12.345.678/0001-90'),
    (N'Global Outsourcing S.A.', N'98.765.432/0001-10');

    DECLARE @tech_id INT = (SELECT id FROM EmpresasParceiras WHERE nome = N'Tech Solutions Ltda');
    DECLARE @global_id INT = (SELECT id FROM EmpresasParceiras WHERE nome = N'Global Outsourcing S.A.');

    INSERT INTO ColaboradoresTerceirizados (empresa_id, cpf, nome, email, cargo) VALUES
    (@tech_id, N'111.222.333-44', N'Lucas Oliveira', N'lucas.oliveira@techsolutions.com', N'Desenvolvedor Frontend Terceirizado'),
    (@tech_id, N'222.333.444-55', N'Mariana Santos', N'mariana.santos@techsolutions.com', N'QA Engineer Terceirizado'),
    (@global_id, N'333.444.555-66', N'Rodrigo Lima', N'rodrigo.lima@globalout.com', N'Analista de Suporte Terceirizado');
END
GO

