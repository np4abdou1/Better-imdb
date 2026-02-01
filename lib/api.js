import axios from 'axios';

const api = axios.create({
  baseURL: '/api'
});

export const searchTitles = async (query) => {
  const { data } = await api.get('/proxy/search', { params: { query } });
  return data;
};

export const getTitleDetails = async (id) => {
  const { data } = await api.get(`/proxy/titles/${id}`);
  return data;
};

export const getTitleEpisodes = async (id, season, pageToken = null) => {
  const params = { season };
  if (pageToken) params.pageToken = pageToken;
  const { data } = await api.get(`/proxy/titles/${id}/episodes`, { params });
  return data;
};

export const getLists = async () => {
  const { data } = await api.get('/lists');
  return data;
};

export const getRating = async (id) => {
  try {
  const { data } = await api.get(`/ratings/${id}`);
  return data;
  } catch (error) {
    // If it's a 500 error or database error, return null instead of throwing
    if (error.response?.status === 500 || error.response?.status === 404) {
      console.warn('Rating not found or database error:', error.message);
      return null;
    }
    // Re-throw other errors
    throw error;
  }
};

export const saveRating = async (id, score, review) => {
  try {
  const { data } = await api.post('/ratings', { title_id: id, score, review });
  return data;
  } catch (error) {
    console.error('Error saving rating:', error);
    // Don't throw - allow UI to continue even if rating save fails
    throw error;
  }
};

export const addListItem = async (listId, titleId) => {
  try {
  const { data } = await api.post(`/lists/${listId}/items`, { title_id: titleId });
  return data;
  } catch (error) {
    console.error('Error adding item to list:', error);
    // If item already exists, that's okay - don't throw
    if (error.response?.status === 409) {
      return { message: 'Item already in list' };
    }
    throw error;
  }
};

export const getTitleCredits = async (id, pageToken = null) => {
  try {
    const params = {};
    if (pageToken) params.pageToken = pageToken;
    const { data } = await api.get(`/proxy/titles/${id}/credits`, { params });
    return data;
  } catch (error) {
    console.error('Error fetching credits:', error);
    return { credits: [], totalCount: 0 };
  }
};

export const getTitleImages = async (id, pageToken = null) => {
  try {
    const params = {};
    if (pageToken) params.pageToken = pageToken;
    const { data } = await api.get(`/proxy/titles/${id}/images`, { params });
    return data;
  } catch (error) {
    console.error('Error fetching images:', error);
    return { images: [], totalCount: 0 };
  }
};

export const getTitleVideos = async (id, pageToken = null) => {
  try {
    const params = {};
    if (pageToken) params.pageToken = pageToken;
    const { data } = await api.get(`/proxy/titles/${id}/videos`, { params });
    return data;
  } catch (error) {
    console.error('Error fetching videos:', error);
    return { videos: [], totalCount: 0 };
  }
};

export default api;
