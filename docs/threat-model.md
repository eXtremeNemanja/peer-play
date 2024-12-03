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

### High-level resources and threats

...

## Threat analysis

...

### ...

...

### ...

...
