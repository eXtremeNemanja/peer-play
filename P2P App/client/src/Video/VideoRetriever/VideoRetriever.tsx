import React, { useEffect, useState } from "react";
import { VideoService } from "../service/VideoService.tsx";
import Button from "../../Components/Button/Button.tsx";
import SelectField from "../../Components/SelectField/SelectField.tsx";
import './VideoRetriever.css'

const VideoRetriever = () => {

    const [owners, setOwners] = useState<string[]>([]);
    const [selectedOwner, setSelectedOwner] = useState("");
    const [videos, setVideos] = useState<string[]>([]);
    const [selectedVideo, setSelectedVideo] = useState("");
    const [videoUrl, setVideoUrl] = useState('');

    const getUsers = async () => {
        const owners = await VideoService.getOnwers();
        // console.log(owners);
        setSelectedOwner(owners.owners[0]);
        setOwners(owners.owners);
    };

    const getVideos = async (owner) => {
        const videos = await VideoService.getUserVideos(owner);
        // console.log(videos.videos);
        setSelectedVideo(videos.videos[0]);
        setVideos(videos.videos);
    };
    

    useEffect(() => {
        getUsers();
    },[]);

    useEffect(() => {
        if (selectedOwner !== "") {
            getVideos(selectedOwner);
        }
    }, [selectedOwner])

    const chooseOwner = (e : any) => {
        e.preventDefault();
        setSelectedOwner(e.target.value);
    }

    const chooseVideo = (e : any) => {
        e.preventDefault();
        setSelectedVideo(e.target.value);
    }

    const retrieveVideo = async (e : any) => {
        const response = await VideoService.getVideo(selectedOwner, selectedVideo);
        if (response == null) {
            alert("Video not purchased");
        } else {
            const url = URL.createObjectURL(response);
            setVideoUrl(url);
        }
    }

    return (
        <div className="selector">
            {owners.length > 0 && (
                <SelectField value={selectedOwner} onChange={chooseOwner} label={"Select owner"} id={"owner-select"} items={owners} />
            )}

            {videos.length > 0 && (
                <SelectField value={selectedVideo} onChange={chooseVideo} label={"Select video"} id={"video-select"} items={videos} />
            )}

            {selectedVideo !== '' && (
                <Button onClick={retrieveVideo} text={"Retrieve video"} />
            )}

            {videoUrl && <video className="video-player" src={videoUrl} controls controlsList="nodownload" />}
        </div>
    );
};

export default VideoRetriever;