const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5001';
const STATUS_TIMEOUT_MS = Number(import.meta.env.VITE_STATUS_TIMEOUT_MS) || 7000;

export const fetchServiceStatuses = async (services) => {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), STATUS_TIMEOUT_MS);

  try {
    const response = await fetch(`${API_BASE_URL}/api/services-status`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ urls: services }),
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`Status request failed with ${response.status}`);
    }

    return response.json();
  } catch (error) {
    if (error.name === 'AbortError') {
      throw new Error(`Status request timed out after ${STATUS_TIMEOUT_MS}ms`, { cause: error });
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
};
