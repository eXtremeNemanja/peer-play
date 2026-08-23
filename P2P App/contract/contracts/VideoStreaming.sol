// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.24;

// Uncomment this line to use console.log
// import "hardhat/console.sol";

contract VideoStreaming {
    struct Video {
        string ipfsHash;
        address owner;
        uint256 price;
        bool isAvailable;
    }

    mapping(string => Video) public videos;
    mapping(address => uint256) public balances;
    mapping(string => mapping(address => bool)) public videoPurchasers;
    
    mapping(bytes32 => uint256) public commitBlock;

    event VideoCommitted(bytes32 commitment, address committer);
    event VideoUploaded(string ipfsHash, address owner, uint256 price);
    event VideoPurchased(string ipfsHash, address buyer);

    // Publish a commitment that binds the upload to the caller's address
    // The commitment is keccak256(cid, price, salt, msg.sender) and reveals nothing about the CID, so a mempool watcher learns nothing
    function commitVideo(bytes32 _commitment) public {
        require(commitBlock[_commitment] == 0, "Commitment exists");
        commitBlock[_commitment] = block.number;
        emit VideoCommitted(_commitment, msg.sender);
    }

    // The commitment is recomputed with msg.sender, so only the original committer can satisfy it
    // A front-runner who copies the reveal computes a different commitment (their own address) that was never committed, so their transaction reverts.
    function uploadVideo(string memory _ipfsHash, uint256 _price, bytes32 _salt) public {
        bytes32 commitment = keccak256(abi.encodePacked(_ipfsHash, _price, _salt, msg.sender));
        require(commitBlock[commitment] != 0, "No matching commit");
        require(block.number > commitBlock[commitment], "Reveal too early");
        require(videos[_ipfsHash].owner == address(0), "Video already exists");

        videos[_ipfsHash] = Video({
            ipfsHash: _ipfsHash,
            owner: msg.sender,
            price: _price,
            isAvailable: true
        });

        emit VideoUploaded(_ipfsHash, msg.sender, _price);
    }

    // Function to purchase access to a video
    function purchaseVideo(string memory _ipfsHash) public payable {
        Video storage video = videos[_ipfsHash];
        require(video.isAvailable, "Video is not available");
        require(msg.value >= video.price, "Insufficient payment");

        balances[video.owner] += msg.value;

        videoPurchasers[_ipfsHash][msg.sender] = true; // Record the purchase

        emit VideoPurchased(_ipfsHash, msg.sender);
    }

    // Function to withdraw earnings
    function withdraw() public {
        uint256 amount = balances[msg.sender];
        require(amount > 0, "No funds to withdraw");

        balances[msg.sender] = 0;
        payable(msg.sender).transfer(amount);
    }

    // Function to check if a user has purchased a video
    function hasPurchased(
        string memory _ipfsHash,
        address _user
    ) public view returns (bool) {
        return videoPurchasers[_ipfsHash][_user];
    }

    // Function to purchase access to several videos in a single transaction.
    function purchaseVideos(string[] memory _ipfsHashes) public payable {
        uint256 totalPrice = 0;
        for (uint256 i = 0; i < _ipfsHashes.length; ) {
            Video storage video = videos[_ipfsHashes[i]];
            require(video.isAvailable, "Video is not available");
            totalPrice += video.price;
            unchecked {
                i++;
            }
        }

        require(msg.value >= totalPrice, "Insufficient payment");
        for (uint256 i = 0; i < _ipfsHashes.length; ) {
            videoPurchasers[_ipfsHashes[i]][msg.sender] = true;
            emit VideoPurchased(_ipfsHashes[i], msg.sender);
                unchecked {
                i++;
            }
        }
    }
}
