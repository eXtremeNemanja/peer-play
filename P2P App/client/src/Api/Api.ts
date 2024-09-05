const API_BASE = () => 'http://localhost:3001/';

export const LOGIN_URL = () => API_BASE() + "login";

export const REGISTER_URL = () => API_BASE() + "register";

export const GET_OWNERS_URL = () => API_BASE() + "getOwners";

export const GET_VIDEOS_URL = (owner : string) => API_BASE() + "getVideos/" + owner;

export const RETRIEVE_VIDEO_URL = () => API_BASE() + "retrieve";

export const PURCHASE_VIDEO_URL = () => API_BASE() + "purchaseVideo";