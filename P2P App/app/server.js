import express from 'express';
import cors from 'cors';
import * as IPFS from 'ipfs-core';
import bodyParser from 'body-parser'

const app = express();
const port = 3001;

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

app.post('/upload', async (req, res) => {
    try {
        const { file } = req.body;
        if (!file) return res.status(400).send('No file provided');
        const { cid } = await ipfs.add(Buffer.from(file, 'base64'));
        res.json({ cid: cid.toString() });
    } catch (error) {
        console.error('Error uploading file:', error);
        res.status(500).send('Error uploading file');
    }
});

app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
});
