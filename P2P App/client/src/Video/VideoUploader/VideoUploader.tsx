import React, { useState, ChangeEvent } from 'react';
import axios from 'axios';

interface Video {
    owner: string;
    filename: string;
    cid: string;
}

const VideoUploader: React.FC = () => {
    const [file, setFile] = useState<File | null>(null);
    const [videos, setVideos] = useState<Video[]>([]);  // State to hold all video records
    const [selectedVideo, setSelectedVideo] = useState<Video | null>(null);  // State to track the selected video
    const [videoUrl, setVideoUrl] = useState('');

    const uploadFile = async () => {
        if (!file) return;
        const reader = new FileReader();
        reader.onloadend = async () => {
            if (reader.result != null && !(reader.result instanceof ArrayBuffer)) {
                const base64File = reader.result!.split(',')[1];
                try {
                    const token = localStorage.getItem('token');
                    const response = await axios.post('http://localhost:3001/upload', {
                        file: base64File,
                        filename: file.name,
                    }, {
                        headers: {
                            Authorization: `Bearer ${token}`, // Add JWT to the Authorization header
                        },
                    });
                    
                    const newVideo: Video = {
                        owner: response.data.file.username,
                        filename: response.data.file.filename,
                        cid: response.data.file.cid,
                    };
                    setVideos([...videos, newVideo]);  // Add the new video to the list
                    setSelectedVideo(newVideo);  // Select the newly uploaded video
                } catch (error) {
                    console.error('Error uploading file:', error);
                }
            }
        };
        reader.readAsDataURL(file);
    };

    const retrieveFile = async () => {
        if (!selectedVideo) return;
        try {
            const response = await axios.get(`http://localhost:3001/retrieve/${selectedVideo.cid}`, {
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
                onChange={(e: ChangeEvent<HTMLInputElement>) => setFile(e.target.files ? e.target.files[0] : null)}
            />
            <button onClick={uploadFile}>Upload to IPFS</button>
            {videos.length > 0 && (
                <div>
                    <label htmlFor="video-select">Select a video:</label>
                    <select
                        id="video-select"
                        value={selectedVideo?.cid || ''}
                        onChange={(e: ChangeEvent<HTMLSelectElement>) => {
                            const selectedCid = e.target.value;
                            const video = videos.find(v => v.cid === selectedCid) || null;
                            setSelectedVideo(video);
                        }}
                    >
                        {videos.map((video, index) => (
                            <option key={index} value={video.cid}>
                                {video.owner} - {video.filename}
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
