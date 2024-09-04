import axios from 'axios';
import { useNavigate } from 'react-router-dom';

// Add a request interceptor
axios.interceptors.request.use(function (config) {
    // Do something before request is sent
    // console.log(config);
    const token = localStorage.getItem("token");
    if (token !== null) {
        config.headers.Authorization = "Bearer " + token
    }
    return config;
  }, function (error) {
    // Do something with request error
    return Promise.reject(error);
  });

// Add a response interceptor
axios.interceptors.response.use(function (response) {
    // Do something with response data
    return response;
  }, function (error) {
    // Do something with response error
    // window.location.href = "/login";
    // console.log(error);
    if (error.status == 403) {
        localStorage.removeItem("token");
        window.location.href = "/login";
    }
    else if (error.status == 401) {
        window.location.href = "/login";
    }
    return Promise.reject(error);
  });

export default axios;