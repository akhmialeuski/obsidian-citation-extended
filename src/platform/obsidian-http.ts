import { requestUrl } from 'obsidian';
import type { HttpGetFn } from '../core';
import type { ZoteroHttpGetFn, ZoteroHttpPostFn } from '../core';

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

/**
 * {@link ZoteroHttpGetFn} backed by `requestUrl`. Unlike {@link obsidianHttpGet}
 * it also exposes the raw response body via `text()`, needed because the Zotero
 * pull export can return BibLaTeX (plain text) as well as CSL JSON.
 */
export const obsidianZoteroGet: ZoteroHttpGetFn = async (url, headers) => {
  const response = await requestUrl({
    url,
    method: 'GET',
    headers,
    throw: false,
  });
  return {
    status: response.status,
    headers: response.headers,
    text: () => Promise.resolve(response.text),
    json: () => Promise.resolve(response.json),
  };
};

/** {@link ZoteroHttpPostFn} backed by `requestUrl`, used for BBT JSON-RPC. */
export const obsidianZoteroPost: ZoteroHttpPostFn = async (
  url,
  body,
  headers,
) => {
  const response = await requestUrl({
    url,
    method: 'POST',
    headers,
    body,
    throw: false,
  });
  return {
    status: response.status,
    headers: response.headers,
    text: () => Promise.resolve(response.text),
    json: () => Promise.resolve(response.json),
  };
};
