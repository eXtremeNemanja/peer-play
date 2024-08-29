import React, { useState } from 'react';
import axios from 'axios';

const VideoUploader = () => {
    const [file, setFile] = useState({} as File);
    const [cids, setCids] = useState([] as String[]);  // State to hold all CIDs
    const [selectedCid, setSelectedCid] = useState('');  // State to track the selected CID
    const [videoUrl, setVideoUrl] = useState('');

    const uploadFile = async () => {
        if (!file) return;
        const reader = new FileReader();
        reader.onloadend = async () => {
            if (reader.result != null && !(reader.result instanceof ArrayBuffer)) {
                console.log(reader.result!.split(',')[1])
                const base64File = reader.result!.split(',')[1];
                try {
                    const response = await axios.post('http://localhost:3001/upload', { file: base64File });
                    const newCid = response.data.cid;
                    setCids([...cids, newCid]);  // Add the new CID to the list
                    setSelectedCid(newCid);  // Select the newly uploaded file
                } catch (error) {
                    console.error('Error uploading file:', error);
                }
            }
        };
        reader.readAsDataURL(file);
    };

    const retrieveFile = async () => {
        if (!selectedCid) return;
        try {
            const response = await axios.get(`http://localhost:3001/retrieve/${selectedCid}`, {
                responseType: 'blob',
            });
            const url = URL.createObjectURL(response.data);
            setVideoUrl(url);
        } catch (error) {
            console.error('Error retrieving file:', error);
        }
    };

    return (
        <div>
            <h2>IPFS Video Uploader</h2>
            <input
                type="file"
                accept="video/*"
                onChange={(e) => setFile(e.target.files![0])}
            />
            <button onClick={uploadFile}>Upload to IPFS</button>
            {cids.length > 0 && (
                <div>
                    <label htmlFor="cid-select">Select a CID:</label>
                    <select
                        id="cid-select"
                        value={selectedCid}
                        onChange={(e) => setSelectedCid(e.target.value)}
                    >
                        {cids.map((cid, index) => (
                            <option key={index} value={cid}>
                                {cid}
                            </option>
                        ))}
                    </select>
                    <button onClick={retrieveFile}>Retrieve from IPFS</button>
                </div>
            )}
            {videoUrl && <video src={videoUrl} controls style={{ maxWidth: '100%', maxHeight: '500px' }} />}
        </div>
    );
};

export default VideoUploader;
