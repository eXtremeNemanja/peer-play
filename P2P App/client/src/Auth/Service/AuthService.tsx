import axios from "axios"
import {LOGIN_URL} from '../../Api/Api.ts'

export const AuthService = {
    login : async (username : string, password : string): Promise<any> => {
        console.log(LOGIN_URL());
        const response = await axios.post(LOGIN_URL(), {username, password});
        return response.data;
    }
}