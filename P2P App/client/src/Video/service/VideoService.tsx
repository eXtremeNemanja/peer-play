import axios from "axios"
import { GET_OWNERS_URL, GET_VIDEOS_URL, RETRIEVE_VIDEO_URL } from "../../Api/Api.ts"

export const VideoService = {
    getOnwers : async () => {
        const response = await axios.get(GET_OWNERS_URL(), {
            headers: {
                Authorization: `Bearer ${localStorage.getItem("token")}`, // Add JWT to the Authorization header
            },
        })
        return response.data;
    },

    getUserVideos : async (username : string) => {
        const response = await axios.get(GET_VIDEOS_URL(username), {
            headers: {
                Authorization: `Bearer ${localStorage.getItem("token")}`, // Add JWT to the Authorization header
            },
        })
        return response.data;
    },

    getVideo : async (owner : string, videoName : string) => {
        const response = await axios.post(RETRIEVE_VIDEO_URL(), {owner, videoName}, {
            headers: {
                Authorization: `Bearer ${localStorage.getItem("token")}`, // Add JWT to the Authorization header
            },
            responseType : 'blob'
        })
        return response.data;
    }
}