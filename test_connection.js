const sql = require('mssql');
require('dotenv').config();

const dbConfig = {
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    server: process.env.DB_SERVER,
    database: process.env.DB_DATABASE,
    options: {
        encrypt: true,
        trustServerCertificate: process.env.DB_TRUST_SERVER_CERTIFICATE === 'true',
    }
};

async function test() {
    try {
        console.log('Attempting to connect to SQL Server with config:', {
            ...dbConfig,
            password: '****'
        });
        const pool = await sql.connect(dbConfig);
        console.log('CONNECTION STATUS: SUCCESS!');
        
        const result = await pool.request().query('SELECT @@version as version');
        console.log('SQL Server Version:', result.recordset[0].version);
        
        await sql.close();
        process.exit(0);
    } catch (err) {
        console.error('CONNECTION STATUS: FAILED!');
        console.error('Error details:', err);
        process.exit(1);
    }
}

test();
