// One adapter for additive errors and legacy service responses. Keep Axios
// errors intact so existing response.data.message consumers remain compatible.
export function apiFailure(error) {
  const body = error.response?.data;
  const code = typeof body?.error?.code === 'string' ? body.error.code : null;
  const message = typeof body?.message === 'string' ? body.message
    : typeof body?.error?.message === 'string' ? body.error.message
      : error.response ? 'Request failed. Please try again.' : 'Could not connect. Please try again.';
  return { status: error.response?.status || 0, code, message,
    requestId: body?.requestId || error.response?.headers?.['x-request-id'] || null };
}
