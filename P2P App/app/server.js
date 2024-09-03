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
    let result;
    if (values === null) {
        result = await dbClient.query(query);
    } else {
        result = await dbClient.query(query, values);
    }
    dbClient.end()
    .then(() => {
        console.log('Disconnected from PostgreSQL database');
    });
    return result;
}

const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; // Extract token from "Bearer <token>"

    if (token == null) return res.sendStatus(401); // If no token, respond with 401 Unauthorized

    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) return res.sendStatus(403); // If token is invalid, respond with 403 Forbidden
        req.user = user; // Attach user info to the request object
        next(); // Proceed to the next middleware or route handler
    });
};

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
        // const token = jwt.sign({ userId: user.id, username: user.username }, JWT_SECRET, {
        //     expiresIn: '1h', // Token expires in 1 hour
        // });

        const token = jwt.sign({ username: user.username }, JWT_SECRET, {
            expiresIn: '1h', // Token expires in 1 hour
        });

        // Return the token to the client
        res.json({ token });
    } catch (err) {
        console.error('Error during login:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
});



app.post('/upload', authenticateToken, async (req, res) => {

    try {
        const {file, filename} = req.body;
        if (!file) return res.status(400).send('No file provided');
        if (!filename) return res.status(400).send('No filename provided');
        const { cid } = await ipfs.add(Buffer.from(file, 'base64'));

        const username = req.user.username;
        
        const insertQuery = `
        INSERT INTO video (owner, filename, cid)
        SELECT id, $1, $2 FROM users WHERE username = $3
        RETURNING (SELECT username FROM users WHERE id = video.owner) AS username, filename, cid;
        `;
        const values = [filename, cid.toString(), username];

        const result = await queryDatabase(insertQuery, values)

        res.json({ file: result.rows[0] });
    } catch (error) {
        if (error.code === '23505') {
            console.error('Error uploading file:', error);
            res.status(400).send('Video already exists');
        } else {
            console.error('Error uploading file:', error);
            res.status(500).send('Error uploading file');
        }
    }
});

app.post('/retrieve', async (req, res) => {
    try {
        const { owner, videoName } = req.body;
        const query = `
            SELECT DISTINCT cid 
            FROM video
            WHERE owner = (SELECT id FROM users WHERE username = $1)
            and filename = $2;`;
        const values = [owner, videoName];

        const result = await queryDatabase(query, values);
        if (result.rows.length === 1) {

            const cid = result.rows[0].cid;
            const chunks = [];
            for await (const chunk of ipfs.cat(cid)) {
                chunks.push(chunk);
            }
            res.send(Buffer.concat(chunks));
        } else {
            res.status(404).send('Video not found');    
        }
    } catch (error) {
        console.error('Error retrieving file:', error);
        res.status(500).send('Error retrieving file');
    }
});

app.get('/getOwners', authenticateToken, async (req, res) => {
    try {
        const query = `
            SELECT DISTINCT u.username
            FROM video v
            JOIN users u ON v.owner = u.id;
        `;

        const result = await queryDatabase(query, null);
        const users = [];
        result.rows.forEach(user => {
            users.push(user.username);
        });
        res.status(200).json({ owners: users });
    } catch (error) {
        console.error('Error retrieving owners:', error);
        res.status(500).send('Error retrieving owners');
    }
});

app.get('/getVideos/:owner', authenticateToken, async (req, res) => {
    
    try {
        const { owner } =  req.params;
        console.log(owner);

        const query = `
            SELECT filename 
            FROM video
            WHERE owner = (SELECT id FROM users WHERE username = $1);`
        const values = [owner];

        const result = await queryDatabase(query, values);

        const videos = [];
        result.rows.forEach(video => {
            videos.push(video.filename);
        });
        
        res.status(200).json({videos : videos})
    } catch (error) {

    }

});

app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
});
