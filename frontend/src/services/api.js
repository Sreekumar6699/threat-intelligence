import axios from 'axios';

const api = axios.create({
  baseURL: '/api',
});

// Since authentication is removed for this weekend project, 
// no interceptors are needed to handle tokens.

export default api;
