import { requestUrl } from 'obsidian';
import type { HttpGetFn } from '../core';

/**
 * {@link HttpGetFn} implementation backed by Obsidian's built-in
 * `requestUrl`, which is required by the Obsidian plugin guidelines
 * (no direct `fetch` usage).
 */
export const obsidianHttpGet: HttpGetFn = async (url, headers) => {
  const response = await requestUrl({
    url,
    method: 'GET',
    headers,
    throw: false,
  });
  return {
    status: response.status,
    headers: response.headers,
    json: () => Promise.resolve(response.json),
  };
};
