/** Keep public files under the repository's GitHub Pages base path. */
export const assetUrl = (path: string) =>
  `${import.meta.env.BASE_URL}${path.replace(/^\/+/, '')}`;
