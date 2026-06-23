import axios from 'axios';

const axiosInstance = axios.create({
  baseURL: '/devticket/api',
  withCredentials: true,
});

// ApiResponse<T> 자동 언래핑: { statusCode, message, data, detail } → data
axiosInstance.interceptors.response.use(
  (res) => {
    if (res.data && typeof res.data === 'object' && 'data' in res.data) {
      res.data = res.data.data;
    }
    return res;
  },
  (error) => {
    if (error.response?.status === 401) {
      window.location.href = '/devticket/login';
    }
    return Promise.reject(error);
  }
);

export default axiosInstance;
