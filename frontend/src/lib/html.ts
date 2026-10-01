/** True when rich-text HTML has no visible text (e.g. "<p><br></p>" or "&nbsp;"). */
export const isBlankHtml = (html: string) => !html.replace(/<[^>]+>|&nbsp;/g, '').trim();
