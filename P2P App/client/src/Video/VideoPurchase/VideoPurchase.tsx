import React, { useEffect, useState } from "react";
import { VideoService } from "../service/VideoService.tsx";
import Button from "../../Components/Button/Button.tsx";
import SelectField from "../../Components/SelectField/SelectField.tsx";
import './VideoPurchase.css'

const VideoPurchase = () => {

    const [owners, setOwners] = useState<string[]>([]);
    const [selectedOwner, setSelectedOwner] = useState("");
    const [videos, setVideos] = useState<string[]>([]);
    const [selectedVideo, setSelectedVideo] = useState("");

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

    const purchaseVideo = async (e : any) => {
        const response = await VideoService.purchaseVideo(selectedOwner, selectedVideo);
        if (response.transactionHash !== undefined) {
            alert("Video purchased successfully: " + response.transactionHash);
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
                <Button onClick={purchaseVideo} text={"Purchase video"} />
            )}

        </div>
    );
};

export default VideoPurchase;