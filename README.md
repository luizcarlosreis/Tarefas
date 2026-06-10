# TaskFlow Gerência

O **TaskFlow Gerência** é um sistema web moderno e responsivo para o controle, acompanhamento e fechamento mensal de projetos e tarefas de uma gerência e suas respectivas coordenadorias.

A aplicação foi projetada com foco em experiência do usuário (UX), adotando uma interface escura estilo **Glassmorphism**, com micro-animações, cards translúcidos e painéis dinâmicos.

---

## 🚀 Recursos Principais

1. **Painel Geral (Dashboard)**:
   * Métricas de projetos ativos, tarefas pendentes, total de colaboradores e horas apontadas.
   * Tabela rápida com o progresso geral e status dos projetos mais recentes.

2. **Gerenciamento de Projetos (CRUD)**:
   * Registro completo de projetos (nome, descrição, prazo, coordenadoria responsável e status).
   * Visualização em grid com barras de progresso calculadas dinamicamente com base nas tarefas.
   * Edição de dados e exclusão de projetos (com exclusão em cascata das tarefas associadas).

3. **Quadro de Tarefas (Kanban)**:
   * Divisão visual de tarefas em colunas: *A Fazer*, *Em Progresso* e *Concluídas*.
   * Controle de prioridades (Alta, Média, Baixa) e responsável.
   * Checklist interativo de **Sub-tarefas** para detalhamento do progresso dentro do card.
   * Apontamento direto de horas estimadas versus horas reais trabalhadas.

4. **Equipes & Setores (CRUD de Coordenadorias e Gerências)**:
   * Cadastro e gerenciamento de **Gerências** (ex: GERTI, GEROP, GERPRO).
   * Cadastro e vinculação de **Coordenadorias** (ex: COSIS, COINF) a suas respectivas Gerências.
   * Cadastro de **Colaboradores** com cargo, email e coordenadoria.

5. **Fechamento Mensal**:
   * Relatório analítico agrupado por período (Mês e Ano).
   * **Visão por Projeto**: consolidado de tarefas criadas, concluídas e total de horas reais consumidas no mês.
   * **Visão por Colaborador**: apontamento de horas individuais e produtividade no período.
   * Layout otimizado para impressão direta ou exportação em **PDF**.

---

## 🛠️ Tecnologias Utilizadas

* **Frontend**: HTML5 semântico, CSS3 puro (sem frameworks como Tailwind para garantir design personalizado), Javascript moderno (ES6 modules).
* **Backend**: Node.js com Express.
* **Banco de Dados**: Microsoft SQL Server (instância local), utilizando o driver nativo `mssql` e pool de conexões.

---

## ⚙️ Configuração e Instalação

### 1. Banco de Dados
O esquema do banco de dados é inicializado automaticamente pelo script `init_db.sql`. 
Ele cria o banco de dados `ControleTarefas`, as tabelas, relacionamentos com integridade referencial (`ON DELETE CASCADE` / `SET NULL`), cria o login `tarefas_user` e insere dados fictícios (Seed) prontos para uso.

Para rodar o script no console usando `sqlcmd`:
```bash
sqlcmd -S localhost -E -f 65001 -i init_db.sql
```

### 2. Configuração do Ambiente (.env)
Crie um arquivo `.env` na raiz do projeto com as seguintes variáveis de conexão:
```env
PORT=3000
DB_USER=tarefas_user
DB_PASSWORD=TarefasPass123!
DB_SERVER=localhost
DB_DATABASE=ControleTarefas
DB_TRUST_SERVER_CERTIFICATE=true
```

### 3. Instalação de Dependências e Execução
Instale os pacotes necessários:
```bash
npm install
```

Inicie o servidor local:
```bash
node server.js
```
Acesse no navegador: **[http://localhost:3000](http://localhost:3000)**
