import axios from "axios"
import { GET_OWNERS_URL, GET_VIDEOS_URL, RETRIEVE_VIDEO_URL } from "../../Api/Api.ts"

export const VideoService = {
    getOnwers : async () => {
        try {
            const response = await axios.get(GET_OWNERS_URL());
            return response.data;
        } catch (error) {
            return {owners : []}
        }
    },

    getUserVideos : async (username : string) => {
        try {
            const response = await axios.get(GET_VIDEOS_URL(username))
            return response.data;
        } catch (error) {
            return {videos : []}
        }
    },

    getVideo : async (owner : string, videoName : string) => {
        try
        {
            const response = await axios.post(RETRIEVE_VIDEO_URL(), {owner, videoName}, {
            responseType : 'blob'
            });
            return response.data;
        } catch (error) {
            return null;
        }
    }
}