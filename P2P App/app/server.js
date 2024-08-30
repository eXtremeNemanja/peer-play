import express from 'express';
import cors from 'cors';
import * as IPFS from 'ipfs-core';
import bodyParser from 'body-parser';
import pg from 'pg';
import { dbConfig, JWT_SECRET } from './config.js';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';

const app = express();
const port = 3001;

const { Client } = pg;

app.use(cors());
// app.use(express.json());
app.use(bodyParser.json({
    parameterLimit: 10000000,
    limit: '500mb',
    extended: true,
    type: 'application/json'
  }));
app.use(bodyParser())
// app.use(express.urlencoded({ limit: '100mb', extended: true }));

let ipfs;

async function createNode() {
    ipfs = await IPFS.create();
    console.log('IPFS node created');
}

createNode();

const queryDatabase = async (query, values) => {
    const dbClient = new Client(dbConfig);
    await dbClient
    .connect()
    .then(() => {
        console.log('Connected to PostgreSQL database');
    });
    // if (dbClient._connected) {
    //     console.log('Client is already connected.');
    // } else {
    //     await dbClient
    //     .connect()
    //     .then(() => {
    //         console.log('Connected to PostgreSQL database');
    //     });
    // }
    const result = await dbClient.query(query, values);
    dbClient.end()
    .then(() => {
        console.log('Disconnected from PostgreSQL database');
    });
    return result;
}

app.post('/register', async (req, res) => {
    const { username, password } = req.body;

    if (!username || !password) {
        return res.status(400).json({ error: 'Username and password are required' });
    }

    try {
        const query = 'INSERT INTO users (username, password) VALUES ($1, $2) RETURNING *';
        const hashedPassword = await bcrypt.hash(password, 10);
        const values = [username, hashedPassword];

        const result = await queryDatabase(query, values)
        
        res.status(201).json({
            message: 'User registered successfully',
            user: result.rows[0], // return the registered user
        });
    } catch (err) {
        if (err.code === '23505') { // unique_violation
            res.status(409).json({ error: 'Username already exists' });
        } else {
            console.error(err);
            res.status(500).json({ error: 'Internal server error' });
        }
    }
});

app.post('/login', async (req, res) => {
    const { username, password } = req.body;

    if (!username || !password) {
        return res.status(400).json({ error: 'Username and password are required' });
    }

    try {
        // Fetch user by username
        const query = 'SELECT * FROM users WHERE username = $1';
        const values = [username];

        const result = await queryDatabase(query, values)
        
        if (result.rows.length === 0) {
            return res.status(401).json({ error: 'Invalid username or password' });
        }

        const user = result.rows[0];

        // Compare the provided password with the stored hashed password
        const passwordMatch = await bcrypt.compare(password, user.password);

        if (!passwordMatch) {
            return res.status(401).json({ error: 'Invalid username or password' });
        }

        // Generate a JWT token
        const token = jwt.sign({ userId: user.id, username: user.username }, JWT_SECRET, {
            expiresIn: '1h', // Token expires in 1 hour
        });

        // Return the token to the client
        res.json({ token });
    } catch (err) {
        console.error('Error during login:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
});



app.post('/upload', async (req, res) => {

    // try {
    //     const { file } = req.body;
    //     if (!file) return res.status(400).send('No file provided');
    //     const { cid } = await ipfs.add(Buffer.from(file, 'base64'));
    //     res.json({ cid: cid.toString() });
    // } catch (error) {
    //     console.error('Error uploading file:', error);
    //     res.status(500).send('Error uploading file');
    // }
});

app.get('/retrieve/:cid', async (req, res) => {
    try {
        const { cid } = req.params;
        const chunks = [];
        for await (const chunk of ipfs.cat(cid)) {
            chunks.push(chunk);
        }
        res.send(Buffer.concat(chunks));
    } catch (error) {
        console.error('Error retrieving file:', error);
        res.status(500).send('Error retrieving file');
    }
});

app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
});
