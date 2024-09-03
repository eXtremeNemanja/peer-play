import axios from "axios"
import {LOGIN_URL, REGISTER_URL} from '../../Api/Api.ts'
import { Credentials } from "../types/Credentials.ts";
import { register } from "module";

export const AuthService = {
    login : async (credentials : Credentials): Promise<any> => {
        console.log(LOGIN_URL());
        const response = await axios.post(LOGIN_URL(), credentials,
    );
        return response.data;
    },

    register : async (credentials : Credentials): Promise<any> => {
        console.log(REGISTER_URL());
        const response = await axios.post(REGISTER_URL(), credentials);
        return response.data;
    }
}