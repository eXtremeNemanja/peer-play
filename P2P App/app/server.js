import express from 'express';
import cors from 'cors';
import * as IPFS from 'ipfs-core';
import bodyParser from 'body-parser';
import pg from 'pg';
import fs from 'fs';
import { DB_CONFIG, ETHERS_PROVIDER, JWT_SECRET, COTRACT_ADDRESS, CONTRACT_ABI_PATH, WALLET_PRIVATE_KEYS } from './config.js';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import * as ethers from 'ethers';

const app = express();
const port = 3001;

const { Client } = pg;

const getAbi = async () => {
    const data = await fs.promises.readFile(CONTRACT_ABI_PATH, 'utf8');
    const abi = JSON.parse(data)['abi'];
    return abi;
}

const provider = new ethers.JsonRpcProvider(ETHERS_PROVIDER);
const signer = await provider.getSigner();
const videoStreamingContract = new ethers.Contract(COTRACT_ADDRESS, await getAbi(), signer);

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
    const dbClient = new Client(DB_CONFIG);
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
        const numOfUsersQuery = 'SELECT COUNT(*) AS number_of_rows FROM users;';
        const numOfUsersRes = await queryDatabase(numOfUsersQuery, null);
        const numOfUsers = numOfUsersRes.rows[0].number_of_rows;
        console.log(numOfUsers);

        const query = 'INSERT INTO users (username, password, private_key) VALUES ($1, $2, $3) RETURNING *';
        const hashedPassword = await bcrypt.hash(password, 10);
        const values = [username, hashedPassword, WALLET_PRIVATE_KEYS[numOfUsers % WALLET_PRIVATE_KEYS.length]];

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
        RETURNING (SELECT username FROM users WHERE id = video.owner) AS username,
        (SELECT private_key FROM users WHERE id = video.owner) AS private_key, filename, cid;
        `;
        const values = [filename, cid.toString(), username];

        const result = await queryDatabase(insertQuery, values)

        const price = ethers.parseEther('0.1'); // Set a price for the video, adjust as needed
        
        const signer = new ethers.Wallet(result.rows[0].private_key, provider);
        
        const tx = await videoStreamingContract.connect(signer).uploadVideo(result.rows[0].cid, price);
        await tx.wait(); // Wait for the transaction to be mined

        // Respond to the client
        res.json({ file: result.rows[0], transactionHash: tx.hash });
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

app.post('/retrieve', authenticateToken, async (req, res) => {
    try {
        const { owner, videoName } = req.body;
        const findVideoQuery = `
            SELECT DISTINCT cid 
            FROM video
            WHERE owner = (SELECT id FROM users WHERE username = $1)
            and filename = $2;`;
        const findVideoValues = [owner, videoName];

        const findVideoResult = await queryDatabase(findVideoQuery, findVideoValues);
        if (findVideoResult.rows.length === 1) {

            const cid = findVideoResult.rows[0].cid;
            const findUserKeyQuery = `
                SELECT private_key
                FROM users
                WHERE username = $1;`;
            const findUserKeyValues = [req.user.username];
            const findUserKeyResult = await queryDatabase(findUserKeyQuery, findUserKeyValues);
            const userWallet = new ethers.Wallet(findUserKeyResult.rows[0].private_key, provider);
            
            const hasPurchased = await videoStreamingContract.hasPurchased(cid, userWallet.address);
            console.log(hasPurchased);

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

app.put('/purchaseVideo', authenticateToken, async (req, res) => {
    try {
        const username = req.user.username;

        const { owner, videoName } = req.body;
        const findVideoQuery = `
            SELECT DISTINCT cid 
            FROM video
            WHERE owner = (SELECT id FROM users WHERE username = $1)
            and filename = $2;`;
        const findVideoValues = [owner, videoName];

        const findVideoResult = await queryDatabase(findVideoQuery, findVideoValues);
        if (findVideoResult.rows.length === 1) {

            const cid = findVideoResult.rows[0].cid;
            const findUserKeyQuery = `
                SELECT private_key
                FROM users
                WHERE username = $1;`;
            const findUserKeyValues = [username];
            const findUserKeyResult = await queryDatabase(findUserKeyQuery, findUserKeyValues);
            const userWallet = new ethers.Wallet(findUserKeyResult.rows[0].private_key, provider);

            const tx = await videoStreamingContract.connect(userWallet).purchaseVideo(cid, {
                value: ethers.parseEther("0.5"),
            });
            await tx.wait(); // Wait for the transaction to be mined

            res.json({ transactionHash: tx.hash });
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
