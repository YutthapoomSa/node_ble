const mysql = require('mysql2');

const pool = mysql.createPool({
    host: 'localhost',
    user: 'root',
    password: '',
    database: 'ble_tracking',
    connectionLimit: 15,
    waitForConnections: true,
    queueLimit: 0,
});

const db = pool.promise();

module.exports = db;