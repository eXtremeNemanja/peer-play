# Threat model for _peer-play_ - a p2p video sharing platform

_Report done by [Nemanja Dutina](https://github.com/eXtremeNemanja/) and [Milica Sladaković](https://github.com/coma007/)._   



This document provides threat modeling overview for a peer-to-peer video sharing platform that uses blockchain technology to secure video ownership, transactions, and user interactions. The platform has decentralized storage, smart contracts, and relational databases.

## Platform architecture

The platform architecture consists of the following components:

- **Relational database** - stores user credentials and video metadata, including ownership and [content identifiers (_CID_)](https://filebase.com/blog/what-is-an-ipfs-cid/) for locating videos in the peer-to-peer network.
- **Peer-to-peer network** - [_IPFS_ (InterPlanetary File System)](https://docs.ipfs.tech/) stores and retrieves video content, with [_libp2p_ protocol](https://docs.libp2p.io/concepts/fundamentals/protocols/) used for peer-to-peer communication.
- **Blockchain network** - local _Ethereum_ blockchain in [_HardHat_ environment](https://hardhat.org/docs) that uses [_JSON-RPC_ protocol](https://www.jsonrpc.org/) and secures ownership integrity and payment processing using smart contracts.
- **Server Application** - acts as a mediator between the database, blockchain, and peer-to-peer systems - keeps all the business logic in one place.
- **Client Application** - interface for users to upload, purchase, and play videos, with authentication and interaction modules.

The image bellow shows simple overview of the platform architecture.

![pp-architecture](https://github.com/user-attachments/assets/96d743a9-7a41-4efa-8cd9-e22925292de9)

This threat model will examine potential security risks associated with the use of technologies such as [_Node.js_](https://nodejs.org/docs/latest/api/), [_React_](https://react.dev/reference/react), [_Hardhat_](https://hardhat.org/docs), and [_PostgreSQL_](https://wiki.postgresql.org/wiki/Main_Page), as well as the protocols like [_libp2p_](https://docs.libp2p.io/concepts/fundamentals/protocols/) and [_JSON-RPC_](https://www.jsonrpc.org/), focusing on blockchain, IPFS integration, user authentication, and server-client interactions.

## Platform data flows

The analyzed platform is a decentralized peer-to-peer video sharing system that offers the following functionalities:

- _Video Upload_: Users can upload their videos to the platform.
- _Video Purchase_: Users can securely purchase videos using integrated payment methods.
- _Video Playback_: Videos can be streamed directly on the platform without downloading.


To support these functionalities, the platform relies on three primary resources:

- _User Data_: Information related to user accounts.
- _Videos and Metadata_: Uploaded video content along with descriptive and transactional data.
- _Smart Contracts_: Blockchain-based contracts enabling secure and automated transactions.

The communication methods between platform components and the flow of data are outlined below:

1. User Application to Server Application

    - **Protocol**: _HTTP_
    - **Resources**: 
        - User requests (login, video uploads, purchases or playback)
    - **Actions**:
        - Authentication data is sent to the server for verification.
        - Video files are uploaded to be processed and stored in IPFS.
        - Purchase requests triggers smart contract execution on the Ethereum network.

2. Server Application to Relational Database (PostgreSQL)

    - **Protocol**: _HTTP_
    - **Resources**:
        - Usernames and hashed passwords
        - Video metadata (title, description, CID, ownership info)
    - **Actions**:
        - User authentication is validated against stored credentials.
        - Video metadata is stored or retrieved as needed.

3. Server Application to Peer-to-Peer Network (IPFS)

    - **Protocol**: _libp2p_
    - **Resources**: 
        - Video content when uploading
        - CID (Content Identifier) when retrieve stored videos
    - **Actions**:
        - Upload videos to IPFS, returning the CID.
        - Retrieve videos based on the provided CID.

4. Server Application to Blockchain Network (Ethereum)

    - **Protocol**: _JSON-RPC_
    - **Resources**:
        - Smart contract execution enforcing ownership,secure payments and access rights
    - **Actions**:
        - Register video ownership using a smart contract.
        - Process payments for video purchases.

## High-level resources and threats

### **IPFS**
### [High-Level Threat] Unauthorized Access to Stored Video Content

IPFS doesn't provide any access controls, so anyone with the CID (Content Identifier) can access files.

#### [Low-Level Threat] Lack of Access Controls on Sensitive Data

- IPFS does not provide encryption for stored data.
- Files stored on IPFS are publicly accessible unless encrypted.

**Attacks**:

- **CID Discovery via Brute Force**: Attackers can generate or guess random CIDs to discover files.
- **Man-in-the-Middle (MITM) Attack on CID Sharing**: Intercept CIDs during transmission to access the data.

#### [Low-Level Threat] Exposure of Sensitive Metadata

- IPFS peers can reveal metadata such as which node is hosting specific files.

**Attacks**:

- **Traffic Analysis**: Attacker observes IPFS network traffic to identify nodes hosting specific content.
- **Node Enumeration**: Map the network to locate and target specific nodes hosting content.

### [High-Level Threat] Denial of Service (DoS) Attacks

IPFS depends on peer availability and bandwidth.

#### [Low-Level Threat] Resource Exhaustion on Specific Nodes

- Attackers target nodes to overwhelm them with requests.

**Attacks**:

- **Request Flooding**: Overload a node with repeated requests for files.

#### [Low-Level Threat] Network-Level Attacks

- Attackers exploit vulnerabilities in the IPFS protocol.

**Attacks**:
- **Sybil Attack**: Create numerous fake nodes to disrupt file availability or tamper with routing.
- **Routing Table Poisoning**: Inject malicious routes into the IPFS DHT (Distributed Hash Table).

...

...

### Smart Contracts

A smart contract is a piece of code stored and executed on a blockchain. It automatically creates agreements between parties. While smart contracts are powerful, they are prone to vulnerabilities. This is because once deployed, their code is immutable. If the code contains bugs, these cannot be fixed easily. Also, the transparency of blockchain data allows attackers to study the contract's behavior to identify its weaknesses. This makes smart contracts attractive targets for attackers, especially in platforms dealing with financial and ownership transactions. 

#### [Higher severity threat] Smart Contract Reentrancy

Reentrancy happens when smart contract allows external call (to another contract) before it has finished updating its internal state. If the external contract can call back into the original contract (either directly or indirectly), it can cause recursion as well as repeating certain operations before the internal state is updated.

Reentrancy is common and severe vulnerability because it allows attackers to drain funds from smart contract. The famous DAO attack [1] (_Chapter 1.5.1_) used this flaw to steal over $50 million worth of Ether.

Possible attacks include:
- **Unsecured withdrawal function** - when attacker repeatedly invokes contract's `withdraw` function by exploiting the failure to update the user's balance before sending funds (example: each recursive call withdraws additional funds, causing financial losses)
- **Reentrant token transfers** - when attacker uses malicious contract that interacts with token transfer function to use tokens by repeatedly triggering the transfer before balances are correctly updated.

#### [Lower severity threat] Exceeding Block Gas Limit

Every transaction executed on blockchain network consumes a certain amount of "gas," which represents computational effort. If a transaction requires more gas than the block gas limit, it will fail, effectively causing a denial of service (DoS). This threat is particularly relevant in contracts involving loops or complex computations.

For example, a contract that processes multiple user requests in a single transaction might accidentally exceed the gas limit, creating the invalid transaction. Attackers can exploit this by sending data or inputs that lead to excessive gas usage, disrupting service availability.

Possible attacks include:
- **Massive input data** - when the attacker sends unusually large amount of input data to a smart contract, forcing it to use more gas than the block gas limit, causing transaction failure.
- **Complex computation trigger** - when the attacker manipulates inputs to activate high-complexity paths in the contract logic,which will increase gas consumption and might surpass the gas limit.

#### [Lower severity threat] Front-Running

Front-running happens when attacker observes transaction in the blockchain mempool and submits their own transaction with a higher gas fee to ensure it is processed first. This exploits the order of transaction execution in blockchain systems. It is particularly problematic in decentralized finance (DeFi) platforms and marketplaces where timing is critical like auctions or token swaps.

For example, in marketplace, attacker can see a bid for an asset and place a higher bid to purchase the asset before the original transaction is executed. This undermines fair competition and can lead to financial losses for users.

Possible attacks include:
- **DeFi trade exploitation** - when attacker observes a large pending trade in a DeFi protocol and submits a similar trade with a higher gas fee to profit from price movement caused by the original trade.

### ...

...

#### [Higher severity threat]

...

#### [Lower severity threat]

...

## Reference

[1] Ma, R., Gorzny, J., Zulkoski, E., Bak, K., & Mack, O. V. (2019). Fundamentals of Smart Contract Security. Momentum Press.
