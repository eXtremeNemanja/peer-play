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

    event VideoUploaded(string ipfsHash, address owner, uint256 price);
    event VideoPurchased(string ipfsHash, address buyer);

    // Function to upload a new video
    function uploadVideo(string memory _ipfsHash, uint256 _price) public {
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
    // VULNERABLE: the whole summing loop is wrapped in `unchecked` to save gas on the
    // `i++` counter increment. That is a common optimization, but wrapping the *entire*
    // loop also disables overflow checking on `totalPrice += video.price`. Because any
    // uploader can set an arbitrary price, an attacker can upload a video whose price is
    // close to type(uint256).max so the sum wraps around to a small number, and the
    // payment check below passes for almost nothing.
    function purchaseVideos(string[] memory _ipfsHashes) public payable {
        uint256 totalPrice = 0;
        unchecked {
            for (uint256 i = 0; i < _ipfsHashes.length; i++) {
                Video storage video = videos[_ipfsHashes[i]];
                require(video.isAvailable, "Video is not available");
                totalPrice += video.price;
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
